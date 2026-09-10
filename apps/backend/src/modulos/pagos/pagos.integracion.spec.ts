// Prueba de integración del flujo de pago.
//
// Cubre los seis casos que exige el plan: aprobado, pendiente, rechazado,
// webhook duplicado, firma inválida y retorno sin webhook. Corre contra
// PostgreSQL en proceso y con la pasarela simulada, así que ejercita el mismo
// camino que producción sin tocar dinero.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  CARPETA_MIGRACIONES,
  pagosDeReserva,
  SEPARADOR_SENTENCIAS,
  totalCobrado,
  type BaseDatos,
} from '@manly/base-datos';
import type { BloqueElegido } from '@manly/contratos';

import { DisponibilidadServicio } from '../disponibilidad/disponibilidad.servicio';
import { firmarNotificacion } from './dominio/firma-webhook';
import { NotificacionesServicio } from '../notificaciones/notificaciones.servicio';
import { ReservasServicio } from '../reservas/reservas.servicio';
import { PagosServicio } from './pagos.servicio';
import { SimuladaPasarela } from './pasarela/simulada.pasarela';

const SECRETO = 'secreto-de-prueba';

/** Un jueves lo bastante lejos como para que nunca quede en el pasado. */
function proximoJueves(): string {
  const fecha = new Date(Date.now() + 30 * 24 * 3_600_000);

  while (fecha.getUTCDay() !== 4) {
    fecha.setUTCDate(fecha.getUTCDate() + 1);
  }

  return fecha.toISOString().slice(0, 10);
}

const JUEVES = proximoJueves();

/** Configuración mínima, con los valores que el servicio de pagos consulta. */
function configuracionFalsa(): ConfigService {
  const valores: Record<string, string> = {
    MP_SECRETO_WEBHOOK: SECRETO,
    NEXT_PUBLIC_URL_PUBLICA: 'http://localhost:3000',
    URL_PUBLICA_API: 'http://localhost:3001/api/v1',
  };

  return { get: (clave: string) => valores[clave] } as unknown as ConfigService;
}

interface Contexto {
  cerrar: () => Promise<void>;
  ejecutar: (sql: string, parametros?: unknown[]) => Promise<{ rows: Record<string, string>[] }>;
  bd: BaseDatos;
  disponibilidad: DisponibilidadServicio;
  reservas: ReservasServicio;
  pagos: PagosServicio;
  pasarela: SimuladaPasarela;
  ids: { sucursalId: string; conSeniaId: string; sinSeniaId: string; anaId: string };
}

async function montar(): Promise<Contexto> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { btree_gist } = await import('@electric-sql/pglite/contrib/btree_gist');

  const cliente = new PGlite({ extensions: { btree_gist } });

  for (const archivo of readdirSync(CARPETA_MIGRACIONES)
    .filter((nombre) => nombre.endsWith('.sql'))
    .sort()) {
    for (const sentencia of readFileSync(join(CARPETA_MIGRACIONES, archivo), 'utf8')
      .split(SEPARADOR_SENTENCIAS)
      .map((trozo) => trozo.trim())
      .filter(Boolean)) {
      await cliente.exec(sentencia);
    }
  }

  const ejecutar = async (sql: string, parametros: unknown[] = []) =>
    cliente.query<Record<string, string>>(sql, parametros);

  const unaFila = async (sql: string, parametros: unknown[] = []): Promise<string> => {
    const id = (await ejecutar(sql, parametros)).rows[0]?.id;

    if (id === undefined) throw new Error(`Sin id: ${sql}`);

    return id;
  };

  await ejecutar(`INSERT INTO configuracion_negocio DEFAULT VALUES`);

  const sucursalId = await unaFila(
    `INSERT INTO sucursales (nombre, barrio, direccion) VALUES ('Las Cañitas', 'Las Cañitas', 'Calle 1') RETURNING id`,
  );
  // 30% de 40.000 pesos = 12.000 de seña.
  const conSeniaId = await unaFila(
    `INSERT INTO servicios (nombre, duracion_minutos, precio_centavos, modalidad_senia, senia_porcentaje)
     VALUES ('Color', 60, 4000000, 'porcentual', 30) RETURNING id`,
  );
  const sinSeniaId = await unaFila(
    `INSERT INTO servicios (nombre, duracion_minutos, precio_centavos) VALUES ('Corte', 60, 1500000) RETURNING id`,
  );
  const anaId = await unaFila(`INSERT INTO profesionales (nombre) VALUES ('Ana') RETURNING id`);

  await ejecutar(
    `INSERT INTO servicios_sucursales (servicio_id, sucursal_id) VALUES ($1, $3), ($2, $3)`,
    [conSeniaId, sinSeniaId, sucursalId],
  );
  await ejecutar(
    `INSERT INTO profesionales_sucursales (profesional_id, sucursal_id) VALUES ($1, $2)`,
    [anaId, sucursalId],
  );
  await ejecutar(
    `INSERT INTO profesionales_servicios (profesional_id, servicio_id) VALUES ($1, $2), ($1, $3)`,
    [anaId, conSeniaId, sinSeniaId],
  );
  await ejecutar(
    `INSERT INTO horarios_semanales (profesional_id, sucursal_id, dia_semana, comienza, termina)
     VALUES ($1, $2, 4, '10:00', '20:00')`,
    [anaId, sucursalId],
  );

  const bd = drizzle(cliente as never) as unknown as BaseDatos;
  const pasarela = new SimuladaPasarela('http://localhost:3001/api/v1');
  const notificaciones = new NotificacionesServicio(bd, configuracionFalsa() as never);

  return {
    cerrar: () => cliente.close(),
    ejecutar,
    bd,
    disponibilidad: new DisponibilidadServicio(bd),
    reservas: new ReservasServicio(bd, notificaciones),
    pagos: new PagosServicio(bd, pasarela, configuracionFalsa() as never, notificaciones),
    pasarela,
    ids: { sucursalId, conSeniaId, sinSeniaId, anaId },
  };
}

let contexto: Contexto;

beforeEach(async () => {
  contexto = await montar();
});

afterEach(async () => {
  await contexto.cerrar();
});

const CLIENTE = {
  nombre: 'Nicolás',
  canalContacto: 'whatsapp' as const,
  whatsapp: '5491133334444',
  aceptaCondiciones: true as const,
};

/** Deja una reserva con seña lista para pagar y devuelve su token. */
async function reservaConSenia(): Promise<string> {
  const { opciones } = await contexto.disponibilidad.buscar({
    sucursalId: contexto.ids.sucursalId,
    servicios: [{ servicioId: contexto.ids.conSeniaId, profesionalId: null }],
    desde: `${JUEVES}T00:00:00.000Z`,
    hasta: `${JUEVES}T23:59:00.000Z`,
  });

  const bloques: BloqueElegido[] = opciones[0]!.bloques.map((bloque) => ({
    servicioId: bloque.servicioId,
    profesionalId: bloque.profesionalId,
    orden: bloque.orden,
    comienzaEn: bloque.comienzaEn,
    terminaEn: bloque.terminaEn,
  }));

  const retencion = await contexto.reservas.retener({
    sucursalId: contexto.ids.sucursalId,
    bloques,
  });

  await contexto.reservas.confirmar({ token: retencion.token, cliente: CLIENTE });

  return retencion.token;
}

describe('crear la preferencia de pago', () => {
  it('devuelve el enlace y el monto de la seña', async () => {
    const token = await reservaConSenia();

    const preferencia = await contexto.pagos.crearPreferencia(token);

    expect(preferencia.montoCentavos).toBe(1_200_000);
    expect(preferencia.urlPago).toContain('/pagos/simulado/');
  });

  it('estira la retención mientras la persona paga', async () => {
    const token = await reservaConSenia();

    const antes = await contexto.ejecutar(
      `SELECT retencion_expira_en FROM reservas WHERE hash_token_gestion IS NOT NULL LIMIT 1`,
    );

    await contexto.pagos.crearPreferencia(token);

    const despues = await contexto.ejecutar(
      `SELECT retencion_expira_en FROM reservas WHERE hash_token_gestion IS NOT NULL LIMIT 1`,
    );

    const momento = (fila: Record<string, string> | undefined): number =>
      new Date(String(fila?.retencion_expira_en ?? 0)).getTime();

    expect(momento(despues.rows[0])).toBeGreaterThan(momento(antes.rows[0]));
  });

  it('rechaza cobrar una reserva sin seña', async () => {
    const { opciones } = await contexto.disponibilidad.buscar({
      sucursalId: contexto.ids.sucursalId,
      servicios: [{ servicioId: contexto.ids.sinSeniaId, profesionalId: null }],
      desde: `${JUEVES}T00:00:00.000Z`,
      hasta: `${JUEVES}T23:59:00.000Z`,
    });

    const retencion = await contexto.reservas.retener({
      sucursalId: contexto.ids.sucursalId,
      bloques: opciones[0]!.bloques.map((b) => ({
        servicioId: b.servicioId,
        profesionalId: b.profesionalId,
        orden: b.orden,
        comienzaEn: b.comienzaEn,
        terminaEn: b.terminaEn,
      })),
    });

    await expect(contexto.pagos.crearPreferencia(retencion.token)).rejects.toThrow(/no lleva seña/);
  });

  it('no vuelve a cobrar una seña ya pagada', async () => {
    const token = await reservaConSenia();
    const preferencia = await contexto.pagos.crearPreferencia(token);

    const pago = contexto.pasarela.resolverPago(preferencia.preferenciaId, 'aprobado')!;
    await contexto.pagos.procesarNotificacion(pago.id);

    // Con el pago acreditado la reserva ya quedó confirmada, así que la primera
    // guarda que corta es esa. La de "seña ya pagada" cubre el caso raro de un
    // pago acreditado sobre una reserva que no llegó a confirmarse.
    await expect(contexto.pagos.crearPreferencia(token)).rejects.toThrow(
      /ya está confirmada|ya fue pagada/,
    );
  });

  it('rechaza un token inexistente', async () => {
    await expect(contexto.pagos.crearPreferencia('token-inventado')).rejects.toThrow(
      /No encontramos/,
    );
  });
});

describe('pago aprobado', () => {
  it('confirma la reserva y registra el movimiento', async () => {
    const token = await reservaConSenia();
    const preferencia = await contexto.pagos.crearPreferencia(token);
    const pago = contexto.pasarela.resolverPago(preferencia.preferenciaId, 'aprobado')!;

    await contexto.pagos.procesarNotificacion(pago.id);

    const reserva = await contexto.reservas.consultar(token);
    expect(reserva.estado).toBe('confirmada');

    const movimientos = await pagosDeReserva(contexto.bd, reserva.id);
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0]).toMatchObject({
      tipo: 'senia',
      medio: 'mercado_pago',
      estado: 'aprobado',
      montoCentavos: 1_200_000,
    });
    expect(movimientos[0]!.acreditadoEn).not.toBeNull();
  });

  it('deja de depender de la retención una vez confirmada', async () => {
    const token = await reservaConSenia();
    const preferencia = await contexto.pagos.crearPreferencia(token);
    const pago = contexto.pasarela.resolverPago(preferencia.preferenciaId, 'aprobado')!;

    await contexto.pagos.procesarNotificacion(pago.id);

    const fila = await contexto.ejecutar(
      `SELECT retencion_expira_en FROM reservas WHERE estado = 'confirmada'`,
    );

    expect(fila.rows[0]!.retencion_expira_en).toBeNull();
  });
});

describe('pago pendiente y rechazado', () => {
  it('un pago pendiente no confirma la reserva', async () => {
    const token = await reservaConSenia();
    const preferencia = await contexto.pagos.crearPreferencia(token);
    const pago = contexto.pasarela.resolverPago(preferencia.preferenciaId, 'pendiente')!;

    await contexto.pagos.procesarNotificacion(pago.id);

    expect((await contexto.reservas.consultar(token)).estado).toBe('pendiente_pago');

    const estado = await contexto.pagos.estadoDelPago(token);
    expect(estado.reservaConfirmada).toBe(false);
    expect(estado.esperandoConfirmacion).toBe(true);
  });

  it('un pago rechazado no confirma y se le avisa a la persona', async () => {
    const token = await reservaConSenia();
    const preferencia = await contexto.pagos.crearPreferencia(token);
    const pago = contexto.pasarela.resolverPago(preferencia.preferenciaId, 'rechazado')!;

    await contexto.pagos.procesarNotificacion(pago.id);

    expect((await contexto.reservas.consultar(token)).estado).toBe('pendiente_pago');

    const estado = await contexto.pagos.estadoDelPago(token);
    expect(estado.estadoPago).toBe('rechazado');
    expect(estado.esperandoConfirmacion).toBe(false);
    expect(estado.mensaje).toMatch(/no se pudo procesar/i);
  });

  it('un pendiente que después se acredita confirma la reserva sin duplicar el movimiento', async () => {
    const token = await reservaConSenia();
    const preferencia = await contexto.pagos.crearPreferencia(token);
    const pago = contexto.pasarela.resolverPago(preferencia.preferenciaId, 'pendiente')!;

    await contexto.pagos.procesarNotificacion(pago.id);
    expect((await contexto.reservas.consultar(token)).estado).toBe('pendiente_pago');

    // El mismo pago se acredita más tarde y Mercado Pago vuelve a notificar.
    contexto.pasarela.cambiarEstado(pago.id, 'aprobado');
    await contexto.pagos.procesarNotificacion(pago.id);

    const reserva = await contexto.reservas.consultar(token);
    expect(reserva.estado).toBe('confirmada');

    // Sigue siendo un solo movimiento: se actualizó, no se duplicó.
    const movimientos = await pagosDeReserva(contexto.bd, reserva.id);
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0]!.estado).toBe('aprobado');
  });
});

describe('idempotencia', () => {
  it('la misma notificación repetida no duplica el movimiento', async () => {
    const token = await reservaConSenia();
    const preferencia = await contexto.pagos.crearPreferencia(token);
    const pago = contexto.pasarela.resolverPago(preferencia.preferenciaId, 'aprobado')!;

    // Mercado Pago reintenta: la misma notificación llega varias veces.
    await contexto.pagos.procesarNotificacion(pago.id);
    await contexto.pagos.procesarNotificacion(pago.id);
    await contexto.pagos.procesarNotificacion(pago.id);

    const reserva = await contexto.reservas.consultar(token);
    const movimientos = await pagosDeReserva(contexto.bd, reserva.id);

    expect(movimientos).toHaveLength(1);
    expect(await totalCobrado(contexto.bd, reserva.id)).toBe(1_200_000);
  });

  it('una notificación de un pago inexistente no rompe nada', async () => {
    const resultado = await contexto.pagos.procesarNotificacion('pago-que-no-existe');

    expect(resultado.procesado).toBe(false);
  });
});

describe('firma del webhook', () => {
  it('acepta una notificación firmada con el secreto correcto', () => {
    const firma = firmarNotificacion({
      idRecurso: '12345',
      idPeticion: 'pet-1',
      secreto: SECRETO,
    });

    expect(
      contexto.pagos.verificarFirma({
        cabeceraFirma: firma.cabeceraFirma,
        idPeticion: firma.idPeticion,
        idRecurso: '12345',
      }),
    ).toBe(true);
  });

  it('rechaza una notificación firmada con otro secreto', () => {
    const firma = firmarNotificacion({
      idRecurso: '12345',
      idPeticion: 'pet-1',
      secreto: 'secreto-del-atacante',
    });

    expect(
      contexto.pagos.verificarFirma({
        cabeceraFirma: firma.cabeceraFirma,
        idPeticion: firma.idPeticion,
        idRecurso: '12345',
      }),
    ).toBe(false);
  });

  it('rechaza una notificación sin firma', () => {
    expect(
      contexto.pagos.verificarFirma({
        cabeceraFirma: undefined,
        idPeticion: 'pet-1',
        idRecurso: '12345',
      }),
    ).toBe(false);
  });
});

describe('retorno sin webhook', () => {
  it('mientras no llega la notificación, se le pide a la web que siga consultando', async () => {
    const token = await reservaConSenia();

    // La persona pagó y volvió, pero la notificación todavía no llegó.
    await contexto.pagos.crearPreferencia(token);

    const estado = await contexto.pagos.estadoDelPago(token);

    expect(estado.reservaConfirmada).toBe(false);
    expect(estado.esperandoConfirmacion).toBe(true);
    expect(estado.estadoPago).toBeNull();
    expect(estado.mensaje).toMatch(/esperando/i);
  });

  it('cuando la notificación llega tarde, la reserva se confirma igual', async () => {
    const token = await reservaConSenia();
    const preferencia = await contexto.pagos.crearPreferencia(token);
    const pago = contexto.pasarela.resolverPago(preferencia.preferenciaId, 'aprobado')!;

    expect((await contexto.pagos.estadoDelPago(token)).esperandoConfirmacion).toBe(true);

    await contexto.pagos.procesarNotificacion(pago.id);

    const estado = await contexto.pagos.estadoDelPago(token);
    expect(estado.reservaConfirmada).toBe(true);
    expect(estado.mensaje).toMatch(/confirmado/i);
  });
});

describe('reintegros', () => {
  async function reservaPagada() {
    const token = await reservaConSenia();
    const preferencia = await contexto.pagos.crearPreferencia(token);
    const pago = contexto.pasarela.resolverPago(preferencia.preferenciaId, 'aprobado')!;
    await contexto.pagos.procesarNotificacion(pago.id);

    const reserva = await contexto.reservas.consultar(token);

    return { token, reservaId: reserva.id };
  }

  it('registra el reintegro y descuenta del total cobrado', async () => {
    const { reservaId } = await reservaPagada();
    const usuarioId = await contexto.ejecutar(
      `INSERT INTO usuarios (email, nombre, rol) VALUES ('g@manly.ar', 'Gerencia', 'gerencia') RETURNING id`,
    );

    const resultado = await contexto.pagos.reintegrar(
      { reservaId, montoCentavos: 1_200_000, confirmacion: true },
      usuarioId.rows[0]?.id ?? '',
    );

    expect(resultado.ok).toBe(true);
    expect(await totalCobrado(contexto.bd, reservaId)).toBe(0);

    const movimientos = await pagosDeReserva(contexto.bd, reservaId);
    expect(movimientos.some((m) => m.tipo === 'reintegro')).toBe(true);
  });

  it('no permite devolver más de lo cobrado', async () => {
    const { reservaId } = await reservaPagada();
    const usuarioId = await contexto.ejecutar(
      `INSERT INTO usuarios (email, nombre, rol) VALUES ('g2@manly.ar', 'Gerencia', 'gerencia') RETURNING id`,
    );

    await expect(
      contexto.pagos.reintegrar(
        { reservaId, montoCentavos: 5_000_000, confirmacion: true },
        usuarioId.rows[0]?.id ?? '',
      ),
    ).rejects.toThrow(/más de lo que se cobró/);
  });

  it('el saldo cobrado en el local suma al total', async () => {
    const { reservaId } = await reservaPagada();
    const usuarioId = await contexto.ejecutar(
      `INSERT INTO usuarios (email, nombre, rol) VALUES ('g3@manly.ar', 'Gerencia', 'gerencia') RETURNING id`,
    );

    await contexto.pagos.registrarPresencial(
      { reservaId, medio: 'efectivo', montoCentavos: 2_800_000, tipo: 'saldo' },
      usuarioId.rows[0]?.id ?? '',
    );

    // 12.000 de seña más 28.000 de saldo: los 40.000 del servicio.
    expect(await totalCobrado(contexto.bd, reservaId)).toBe(4_000_000);
  });
});
