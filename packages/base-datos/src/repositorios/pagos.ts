// Registro de pagos, saldos y reintegros.
//
// Cada movimiento de dinero queda como una fila propia: no se pisa el estado
// anterior. Así se puede reconstruir qué pasó con una reserva aunque haya
// habido varios intentos, un cobro presencial y una devolución.
import { and, desc, eq, sql } from 'drizzle-orm';

import type { BaseDatos } from '../conexion';
import { pagos, reservas } from '../esquemas/index';

export interface PagoRegistrado {
  id: string;
  reservaId: string;
  tipo: 'senia' | 'saldo' | 'reintegro';
  medio: 'mercado_pago' | 'efectivo' | 'qr_mercado_pago' | 'otro';
  estado: 'pendiente' | 'aprobado' | 'rechazado' | 'cancelado' | 'reintegrado';
  montoCentavos: number;
  idPagoExterno: string | null;
  acreditadoEn: Date | null;
  creadoEn: Date;
}

/**
 * Registra o actualiza el pago que informó la pasarela.
 *
 * Es idempotente por `id_pago_externo`: si la notificación llega repetida —cosa
 * que pasa seguido— la segunda vez actualiza la fila existente en vez de crear
 * otra. Devuelve si el pago pasó a aprobado en esta llamada, que es lo que
 * decide si hay que confirmar la reserva.
 */
export async function registrarPagoDePasarela(
  bd: BaseDatos,
  datos: {
    reservaId: string;
    idPagoExterno: string;
    estado: 'pendiente' | 'aprobado' | 'rechazado' | 'cancelado' | 'reintegrado';
    montoCentavos: number;
    referenciaExterna: string | null;
    datosCrudos: unknown;
  },
): Promise<{ pagoId: string; seAprobóAhora: boolean }> {
  const [existente] = await bd
    .select({ id: pagos.id, estado: pagos.estado })
    .from(pagos)
    .where(eq(pagos.idPagoExterno, datos.idPagoExterno))
    .limit(1);

  const acreditadoEn = datos.estado === 'aprobado' ? new Date() : null;

  if (existente) {
    // Ya estaba aprobado: la notificación repetida no vuelve a confirmar nada.
    const yaEstabaAprobado = existente.estado === 'aprobado';

    await bd
      .update(pagos)
      .set({
        estado: datos.estado,
        datosCrudos: datos.datosCrudos,
        acreditadoEn: acreditadoEn ?? undefined,
        actualizadoEn: new Date(),
      })
      .where(eq(pagos.id, existente.id));

    return {
      pagoId: existente.id,
      seAprobóAhora: datos.estado === 'aprobado' && !yaEstabaAprobado,
    };
  }

  const [creado] = await bd
    .insert(pagos)
    .values({
      reservaId: datos.reservaId,
      tipo: 'senia',
      medio: 'mercado_pago',
      estado: datos.estado,
      montoCentavos: datos.montoCentavos,
      referenciaExterna: datos.referenciaExterna,
      idPagoExterno: datos.idPagoExterno,
      datosCrudos: datos.datosCrudos,
      acreditadoEn,
    })
    .returning({ id: pagos.id });

  if (!creado) {
    throw new Error('No se pudo registrar el pago.');
  }

  return { pagoId: creado.id, seAprobóAhora: datos.estado === 'aprobado' };
}

/**
 * Confirma la reserva porque se acreditó la seña.
 *
 * Sólo actúa sobre una reserva pendiente que ya tenga los datos del cliente:
 * una retención sin completar no puede quedar confirmada. Devuelve si cambió
 * algo, para no disparar dos veces las notificaciones.
 */
export async function confirmarPorPago(bd: BaseDatos, reservaId: string): Promise<boolean> {
  const confirmadas = await bd
    .update(reservas)
    .set({ estado: 'confirmada', retencionExpiraEn: null, actualizadoEn: new Date() })
    .where(
      and(
        eq(reservas.id, reservaId),
        eq(reservas.estado, 'pendiente_pago'),
        sql`${reservas.clienteNombre} IS NOT NULL`,
      ),
    )
    .returning({ id: reservas.id });

  return confirmadas.length > 0;
}

/** Registra un cobro hecho en el local. */
export async function registrarPagoPresencial(
  bd: BaseDatos,
  datos: {
    reservaId: string;
    tipo: 'senia' | 'saldo';
    medio: 'efectivo' | 'qr_mercado_pago' | 'otro';
    montoCentavos: number;
    usuarioId: string;
  },
): Promise<string> {
  const [creado] = await bd
    .insert(pagos)
    .values({
      reservaId: datos.reservaId,
      tipo: datos.tipo,
      medio: datos.medio,
      estado: 'aprobado',
      montoCentavos: datos.montoCentavos,
      registradoPorUsuarioId: datos.usuarioId,
      acreditadoEn: new Date(),
    })
    .returning({ id: pagos.id });

  if (!creado) {
    throw new Error('No se pudo registrar el pago presencial.');
  }

  return creado.id;
}

/**
 * Registra un reintegro.
 *
 * Queda como una fila aparte, de tipo `reintegro`: el pago original conserva su
 * historia. Nunca se dispara solo, siempre lo origina una persona de gerencia.
 */
export async function registrarReintegro(
  bd: BaseDatos,
  datos: {
    reservaId: string;
    montoCentavos: number;
    medio: 'mercado_pago' | 'efectivo' | 'qr_mercado_pago' | 'otro';
    usuarioId: string;
    idPagoExterno?: string | null;
    datosCrudos?: unknown;
  },
): Promise<string> {
  const [creado] = await bd
    .insert(pagos)
    .values({
      reservaId: datos.reservaId,
      tipo: 'reintegro',
      medio: datos.medio,
      estado: 'aprobado',
      montoCentavos: datos.montoCentavos,
      registradoPorUsuarioId: datos.usuarioId,
      idPagoExterno: datos.idPagoExterno ?? null,
      datosCrudos: datos.datosCrudos ?? null,
      acreditadoEn: new Date(),
    })
    .returning({ id: pagos.id });

  if (!creado) {
    throw new Error('No se pudo registrar el reintegro.');
  }

  return creado.id;
}

/** Movimientos de una reserva, del más nuevo al más viejo. */
export async function pagosDeReserva(bd: BaseDatos, reservaId: string): Promise<PagoRegistrado[]> {
  return bd
    .select({
      id: pagos.id,
      reservaId: pagos.reservaId,
      tipo: pagos.tipo,
      medio: pagos.medio,
      estado: pagos.estado,
      montoCentavos: pagos.montoCentavos,
      idPagoExterno: pagos.idPagoExterno,
      acreditadoEn: pagos.acreditadoEn,
      creadoEn: pagos.creadoEn,
    })
    .from(pagos)
    .where(eq(pagos.reservaId, reservaId))
    .orderBy(desc(pagos.creadoEn));
}

/** Cuánto se cobró efectivamente, descontando lo devuelto. */
export async function totalCobrado(bd: BaseDatos, reservaId: string): Promise<number> {
  const movimientos = await pagosDeReserva(bd, reservaId);

  return movimientos
    .filter((movimiento) => movimiento.estado === 'aprobado')
    .reduce(
      (total, movimiento) =>
        movimiento.tipo === 'reintegro'
          ? total - movimiento.montoCentavos
          : total + movimiento.montoCentavos,
      0,
    );
}

/** El pago de seña aprobado de una reserva, si existe. */
export async function pagoDeSeniaAprobado(
  bd: BaseDatos,
  reservaId: string,
): Promise<PagoRegistrado | null> {
  const movimientos = await pagosDeReserva(bd, reservaId);

  return (
    movimientos.find(
      (movimiento) => movimiento.tipo === 'senia' && movimiento.estado === 'aprobado',
    ) ?? null
  );
}

/**
 * Pagos que quedaron sin resolver y hay que volver a consultar.
 *
 * Son los que siguen pendientes pasado un rato: o la notificación se perdió, o
 * llegó cuando la API estaba caída. Se acotan a una ventana porque después de
 * dos días un pago pendiente ya no se va a acreditar.
 */
export async function pagosPendientesDeConciliar(
  bd: BaseDatos,
  horasMaximas: number,
): Promise<PagoRegistrado[]> {
  return bd
    .select({
      id: pagos.id,
      reservaId: pagos.reservaId,
      tipo: pagos.tipo,
      medio: pagos.medio,
      estado: pagos.estado,
      montoCentavos: pagos.montoCentavos,
      idPagoExterno: pagos.idPagoExterno,
      acreditadoEn: pagos.acreditadoEn,
      creadoEn: pagos.creadoEn,
    })
    .from(pagos)
    .where(
      and(
        eq(pagos.estado, 'pendiente'),
        eq(pagos.medio, 'mercado_pago'),
        // Se le da unos minutos al camino normal antes de insistir.
        sql`${pagos.creadoEn} < now() - interval '5 minutes'`,
        sql`${pagos.creadoEn} > now() - make_interval(hours => ${horasMaximas})`,
      ),
    )
    .orderBy(desc(pagos.creadoEn));
}
