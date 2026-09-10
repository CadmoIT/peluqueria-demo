// Consulta y gestión de una reserva desde el enlace privado del cliente.
//
// Todo se hace sin cuenta: el token del enlace es la única credencial, y se
// busca por su hash. La política de anticipación decide si un cambio se aplica
// solo o si tiene que pasar por gerencia.
import { and, asc, eq, type SQL } from 'drizzle-orm';

import type { BaseDatos } from '../conexion';
import {
  configuracionNegocio,
  profesionales,
  reservas,
  reservasServicios,
  servicios,
  solicitudesCambio,
  sucursales,
} from '../esquemas/index';
import {
  esViolacionDeExclusion,
  HorarioNoDisponibleError,
  type BloqueARetener,
} from './retenciones';
import { generarTokenGestion, hashearToken } from './tokens';

export interface BloqueDeReserva {
  orden: number;
  servicioNombre: string;
  profesionalNombre: string;
  comienzaEn: Date;
  terminaEn: Date;
  duracionMinutos: number;
  precioCentavos: number;
}

export interface ReservaConDetalle {
  id: string;
  estado: 'pendiente_pago' | 'confirmada' | 'cancelada' | 'completada' | 'ausente' | 'expirada';
  sucursal: { id: string; nombre: string; barrio: string; direccion: string };
  clienteNombre: string | null;
  /** Canal elegido y datos de contacto, para saber por dónde avisar. */
  canalContacto: 'whatsapp' | 'email' | null;
  contactoWhatsapp: string | null;
  contactoEmail: string | null;
  comienzaEn: Date;
  terminaEn: Date;
  precioTotalCentavos: number;
  seniaTotalCentavos: number;
  retencionExpiraEn: Date | null;
  bloques: BloqueDeReserva[];
  /** Anticipación mínima que rige para esta reserva, ya resuelta. */
  horasMinimasCancelacion: number;
}

/** Estados en los que la reserva todavía se puede cancelar o mover. */
const ESTADOS_GESTIONABLES = ['pendiente_pago', 'confirmada'] as const;

/**
 * Busca una reserva por el token en claro del enlace.
 *
 * Resuelve la anticipación mínima con la precedencia del plan: la del servicio
 * gana sobre la de la sucursal, y ésta sobre la global.
 */
export function buscarReservaPorToken(
  bd: BaseDatos,
  token: string,
): Promise<ReservaConDetalle | null> {
  return armarDetalle(bd, eq(reservas.hashTokenGestion, hashearToken(token)));
}

/**
 * La misma reserva, buscada por identificador.
 *
 * Es la vía del panel: ahí se llega desde la agenda, no desde el enlace del
 * cliente, y el token en claro no existe en ningún lado.
 */
export function buscarReservaPorId(
  bd: BaseDatos,
  reservaId: string,
): Promise<ReservaConDetalle | null> {
  return armarDetalle(bd, eq(reservas.id, reservaId));
}

async function armarDetalle(bd: BaseDatos, condicion: SQL): Promise<ReservaConDetalle | null> {
  const [fila] = await bd
    .select({
      id: reservas.id,
      estado: reservas.estado,
      clienteNombre: reservas.clienteNombre,
      canalContacto: reservas.canalContacto,
      contactoWhatsapp: reservas.contactoWhatsapp,
      contactoEmail: reservas.contactoEmail,
      comienzaEn: reservas.comienzaEn,
      terminaEn: reservas.terminaEn,
      precioTotalCentavos: reservas.precioTotalCentavos,
      seniaTotalCentavos: reservas.seniaTotalCentavos,
      retencionExpiraEn: reservas.retencionExpiraEn,
      sucursalId: sucursales.id,
      sucursalNombre: sucursales.nombre,
      sucursalBarrio: sucursales.barrio,
      sucursalDireccion: sucursales.direccion,
      horasSucursal: sucursales.horasMinimasCancelacion,
    })
    .from(reservas)
    .innerJoin(sucursales, eq(sucursales.id, reservas.sucursalId))
    .where(condicion)
    .limit(1);

  if (!fila) return null;

  const filasBloques = await bd
    .select({
      orden: reservasServicios.orden,
      servicioNombre: reservasServicios.servicioNombre,
      comienzaEn: reservasServicios.comienzaEn,
      terminaEn: reservasServicios.terminaEn,
      duracionMinutos: reservasServicios.duracionMinutos,
      precioCentavos: reservasServicios.precioCentavos,
      profesionalNombre: profesionales.nombre,
      profesionalNombreVisible: profesionales.nombreVisible,
      horasServicio: servicios.horasMinimasCancelacion,
    })
    .from(reservasServicios)
    .innerJoin(profesionales, eq(profesionales.id, reservasServicios.profesionalId))
    .innerJoin(servicios, eq(servicios.id, reservasServicios.servicioId))
    .where(eq(reservasServicios.reservaId, fila.id))
    .orderBy(asc(reservasServicios.orden));

  const [configuracion] = await bd
    .select({ horas: configuracionNegocio.horasMinimasCancelacion })
    .from(configuracionNegocio)
    .limit(1);

  // Precedencia: servicio, sucursal, global. Entre varios servicios manda el
  // más exigente, porque la reserva se cancela entera o no se cancela.
  const horasDeServicios = filasBloques
    .map((bloque) => bloque.horasServicio)
    .filter((horas): horas is number => horas !== null);

  const horasMinimasCancelacion =
    horasDeServicios.length > 0
      ? Math.max(...horasDeServicios)
      : (fila.horasSucursal ?? configuracion?.horas ?? 24);

  return {
    id: fila.id,
    estado: fila.estado,
    sucursal: {
      id: fila.sucursalId,
      nombre: fila.sucursalNombre,
      barrio: fila.sucursalBarrio,
      direccion: fila.sucursalDireccion,
    },
    clienteNombre: fila.clienteNombre,
    canalContacto: fila.canalContacto,
    contactoWhatsapp: fila.contactoWhatsapp,
    contactoEmail: fila.contactoEmail,
    comienzaEn: fila.comienzaEn,
    terminaEn: fila.terminaEn,
    precioTotalCentavos: fila.precioTotalCentavos,
    seniaTotalCentavos: fila.seniaTotalCentavos,
    retencionExpiraEn: fila.retencionExpiraEn,
    horasMinimasCancelacion,
    bloques: filasBloques.map((bloque) => ({
      orden: bloque.orden,
      servicioNombre: bloque.servicioNombre,
      profesionalNombre: bloque.profesionalNombreVisible ?? bloque.profesionalNombre,
      comienzaEn: bloque.comienzaEn,
      terminaEn: bloque.terminaEn,
      duracionMinutos: bloque.duracionMinutos,
      precioCentavos: bloque.precioCentavos,
    })),
  };
}

/**
 * Emite un enlace de gestión nuevo y devuelve el token en claro.
 *
 * Hace falta cuando el aviso lo origina el panel y no el cliente: en la base
 * sólo está el hash, así que el enlace original **no se puede reconstruir**.
 * La alternativa —mandar el aviso sin enlace— no sirve: las plantillas de
 * WhatsApp tienen una cantidad fija de parámetros aprobada por Meta.
 *
 * El costo es que el enlace anterior deja de funcionar. Es aceptable porque el
 * nuevo viaja dentro del mismo mensaje que lo reemplaza.
 */
export async function rotarTokenGestion(bd: BaseDatos, reservaId: string): Promise<string | null> {
  const { token, hash } = generarTokenGestion();

  const actualizadas = await bd
    .update(reservas)
    .set({ hashTokenGestion: hash, actualizadoEn: new Date() })
    .where(eq(reservas.id, reservaId))
    .returning({ id: reservas.id });

  return actualizadas.length > 0 ? token : null;
}

/** Momento a partir del cual el cambio ya requiere aprobación de gerencia. */
export function limiteCambioAutomatico(reserva: ReservaConDetalle): Date {
  return new Date(reserva.comienzaEn.getTime() - reserva.horasMinimasCancelacion * 3_600_000);
}

/** Si a esta altura el cliente todavía puede cancelar o mover por su cuenta. */
export function puedeGestionarSolo(reserva: ReservaConDetalle, ahora = new Date()): boolean {
  if (!ESTADOS_GESTIONABLES.includes(reserva.estado as (typeof ESTADOS_GESTIONABLES)[number])) {
    return false;
  }

  return ahora.getTime() < limiteCambioAutomatico(reserva).getTime();
}

/**
 * Completa una reserva retenida con los datos del cliente.
 *
 * Sólo funciona mientras la reserva siga siendo una retención vigente. Devuelve
 * null si venció o si ya fue completada, para que la API lo distinga de un
 * token inexistente.
 */
export async function completarReserva(
  bd: BaseDatos,
  parametros: {
    reservaId: string;
    nombre: string;
    /** En null cuando no hay por dónde avisar: pasa con los turnos de mostrador. */
    canalContacto: 'whatsapp' | 'email' | null;
    whatsapp: string | null;
    email: string | null;
    notas: string | null;
    /** Se confirma directamente cuando la reserva no lleva seña. */
    confirmar: boolean;
  },
): Promise<{ estado: string } | null> {
  const [actualizada] = await bd
    .update(reservas)
    .set({
      clienteNombre: parametros.nombre,
      canalContacto: parametros.canalContacto,
      contactoWhatsapp: parametros.whatsapp,
      contactoEmail: parametros.email,
      notas: parametros.notas,
      aceptoCondicionesEn: new Date(),
      estado: parametros.confirmar ? 'confirmada' : 'pendiente_pago',
      // Confirmada ya no depende de una retención.
      retencionExpiraEn: parametros.confirmar ? null : undefined,
      actualizadoEn: new Date(),
    })
    .where(and(eq(reservas.id, parametros.reservaId), eq(reservas.estado, 'pendiente_pago')))
    .returning({ estado: reservas.estado });

  return actualizada ?? null;
}

/** Cancela la reserva y libera sus bloques. */
export async function cancelarReserva(bd: BaseDatos, reservaId: string): Promise<boolean> {
  const canceladas = await bd
    .update(reservas)
    .set({ estado: 'cancelada', canceladaEn: new Date(), actualizadoEn: new Date() })
    .where(and(eq(reservas.id, reservaId), eq(reservas.estado, 'confirmada')))
    .returning({ id: reservas.id });

  if (canceladas.length > 0) return true;

  // Una retención sin completar también se puede abandonar.
  const abandonadas = await bd
    .update(reservas)
    .set({ estado: 'cancelada', canceladaEn: new Date(), actualizadoEn: new Date() })
    .where(and(eq(reservas.id, reservaId), eq(reservas.estado, 'pendiente_pago')))
    .returning({ id: reservas.id });

  return abandonadas.length > 0;
}

/** Deja registrada una solicitud para que la resuelva gerencia. */
export async function crearSolicitudCambio(
  bd: BaseDatos,
  parametros: {
    reservaId: string;
    tipo: 'cancelacion' | 'reprogramacion';
    motivo: string | null;
    propuesta?: unknown;
  },
): Promise<string> {
  const [solicitud] = await bd
    .insert(solicitudesCambio)
    .values({
      reservaId: parametros.reservaId,
      tipo: parametros.tipo,
      motivo: parametros.motivo,
      propuesta: parametros.propuesta ?? null,
    })
    .returning({ id: solicitudesCambio.id });

  if (!solicitud) {
    throw new Error('No se pudo registrar la solicitud.');
  }

  return solicitud.id;
}

/** Si ya hay una solicitud sin resolver para esta reserva. */
export async function tieneSolicitudPendiente(bd: BaseDatos, reservaId: string): Promise<boolean> {
  const [pendiente] = await bd
    .select({ id: solicitudesCambio.id })
    .from(solicitudesCambio)
    .where(
      and(eq(solicitudesCambio.reservaId, reservaId), eq(solicitudesCambio.estado, 'pendiente')),
    )
    .limit(1);

  return pendiente !== undefined;
}

/**
 * Reemplaza todos los bloques de una reserva por los de un horario nuevo.
 *
 * Es atómico a propósito: se borran los bloques viejos y se insertan los nuevos
 * en la misma transacción. Si el horario nuevo choca con otra reserva, la
 * restricción de exclusión la rechaza y la transacción se deshace entera, así
 * que el turno original queda intacto. Lo contrario —borrar primero y fallar
 * después— dejaría al cliente sin turno.
 *
 * La seña ya cobrada no se toca: la reserva es la misma, sólo cambia el horario.
 */
export async function reprogramarReserva(
  bd: BaseDatos,
  parametros: { reservaId: string; bloques: BloqueARetener[] },
): Promise<{ comienzaEn: Date; terminaEn: Date }> {
  if (parametros.bloques.length === 0) {
    throw new Error('No se puede reprogramar sin bloques.');
  }

  const ordenados = [...parametros.bloques].sort((a, b) => a.orden - b.orden);
  const comienzaEn = ordenados[0]!.comienzaEn;
  const terminaEn = ordenados[ordenados.length - 1]!.terminaEn;

  try {
    return await bd.transaction(async (tx) => {
      await tx
        .delete(reservasServicios)
        .where(eq(reservasServicios.reservaId, parametros.reservaId));

      await tx.insert(reservasServicios).values(
        ordenados.map((bloque) => ({
          reservaId: parametros.reservaId,
          servicioId: bloque.servicioId,
          profesionalId: bloque.profesionalId,
          orden: bloque.orden,
          comienzaEn: bloque.comienzaEn,
          terminaEn: bloque.terminaEn,
          ocupaDesde: bloque.ocupaDesde,
          ocupaHasta: bloque.ocupaHasta,
          servicioNombre: bloque.servicioNombre,
          duracionMinutos: bloque.duracionMinutos,
          precioCentavos: bloque.precioCentavos,
          seniaCentavos: bloque.seniaCentavos,
          minutosPreparacion: bloque.minutosPreparacion,
          minutosLimpieza: bloque.minutosLimpieza,
        })),
      );

      await tx
        .update(reservas)
        .set({ comienzaEn, terminaEn, actualizadoEn: new Date() })
        .where(eq(reservas.id, parametros.reservaId));

      return { comienzaEn, terminaEn };
    });
  } catch (error: unknown) {
    if (esViolacionDeExclusion(error)) {
      throw new HorarioNoDisponibleError();
    }

    throw error;
  }
}
