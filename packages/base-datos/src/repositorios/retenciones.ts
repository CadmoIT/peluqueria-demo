// Retención de horarios y su expiración.
//
// Retener es escribir la reserva y todos sus bloques en una sola transacción.
// Si dos personas eligen el mismo horario a la vez, ambas pasan la verificación
// previa en memoria y las dos intentan escribir: la restricción EXCLUDE de la
// base rechaza a la segunda. Esa es la única garantía real; el resto es
// optimismo.
import { and, eq, inArray, isNotNull, lte, sql } from 'drizzle-orm';

import type { BaseDatos } from '../conexion';
import { reservas, reservasServicios } from '../esquemas/index';

/** Un bloque a retener, ya resuelto por el motor de disponibilidad. */
export interface BloqueARetener {
  servicioId: string;
  profesionalId: string;
  orden: number;
  comienzaEn: Date;
  terminaEn: Date;
  ocupaDesde: Date;
  ocupaHasta: Date;
  servicioNombre: string;
  duracionMinutos: number;
  precioCentavos: number;
  seniaCentavos: number;
  minutosPreparacion: number;
  minutosLimpieza: number;
}

export interface DatosRetencion {
  sucursalId: string;
  bloques: BloqueARetener[];
  /** Hash del token con el que el cliente después completa la reserva. */
  hashTokenGestion: string;
  minutosRetencion: number;
  /** Queda cargado si la reserva la está creando alguien del panel. */
  creadaPorUsuarioId?: string | null;
}

export interface RetencionCreada {
  reservaId: string;
  comienzaEn: Date;
  terminaEn: Date;
  retencionExpiraEn: Date;
  precioTotalCentavos: number;
  seniaTotalCentavos: number;
}

/** El horario se lo llevó otra persona entre la búsqueda y la confirmación. */
export class HorarioNoDisponibleError extends Error {
  constructor() {
    super('El horario elegido ya fue tomado. Elegí otro.');
    this.name = 'HorarioNoDisponibleError';
  }
}

/** Código de PostgreSQL para la violación de una restricción de exclusión. */
const VIOLACION_EXCLUSION = '23P01';

function esViolacionDeExclusion(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === VIOLACION_EXCLUSION
  );
}

/**
 * Crea la reserva y sus bloques reteniendo el horario.
 *
 * Todo ocurre en una transacción: o entran todos los bloques o no entra
 * ninguno. Una reserva multiservicio a medias no tiene sentido.
 */
export async function retenerHorario(
  bd: BaseDatos,
  datos: DatosRetencion,
): Promise<RetencionCreada> {
  if (datos.bloques.length === 0) {
    throw new Error('No se puede retener una reserva sin bloques.');
  }

  const ordenados = [...datos.bloques].sort((a, b) => a.orden - b.orden);
  const comienzaEn = ordenados[0]!.comienzaEn;
  const terminaEn = ordenados[ordenados.length - 1]!.terminaEn;

  const precioTotalCentavos = ordenados.reduce((total, bloque) => total + bloque.precioCentavos, 0);
  const seniaTotalCentavos = ordenados.reduce((total, bloque) => total + bloque.seniaCentavos, 0);
  const retencionExpiraEn = new Date(Date.now() + datos.minutosRetencion * 60_000);

  try {
    return await bd.transaction(async (tx) => {
      const [reserva] = await tx
        .insert(reservas)
        .values({
          sucursalId: datos.sucursalId,
          estado: 'pendiente_pago',
          comienzaEn,
          terminaEn,
          precioTotalCentavos,
          seniaTotalCentavos,
          hashTokenGestion: datos.hashTokenGestion,
          retencionExpiraEn,
          creadaPorUsuarioId: datos.creadaPorUsuarioId ?? null,
        })
        .returning({ id: reservas.id });

      if (!reserva) {
        throw new Error('No se pudo crear la reserva.');
      }

      await tx.insert(reservasServicios).values(
        ordenados.map((bloque) => ({
          reservaId: reserva.id,
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

      return {
        reservaId: reserva.id,
        comienzaEn,
        terminaEn,
        retencionExpiraEn,
        precioTotalCentavos,
        seniaTotalCentavos,
      };
    });
  } catch (error: unknown) {
    if (esViolacionDeExclusion(error)) {
      throw new HorarioNoDisponibleError();
    }

    throw error;
  }
}

/**
 * Marca como expiradas las retenciones vencidas y libera sus horarios.
 *
 * El trigger de la base propaga el estado a los bloques, con lo que dejan de
 * contar para la restricción de exclusión. Devuelve cuántas expiró.
 */
export async function expirarRetencionesVencidas(bd: BaseDatos): Promise<string[]> {
  const expiradas = await bd
    .update(reservas)
    .set({ estado: 'expirada', actualizadoEn: new Date() })
    .where(
      and(
        eq(reservas.estado, 'pendiente_pago'),
        isNotNull(reservas.retencionExpiraEn),
        lte(reservas.retencionExpiraEn, sql`now()`),
      ),
    )
    .returning({ id: reservas.id });

  return expiradas.map((fila) => fila.id);
}

/** Extiende la retención de una reserva, por ejemplo al mandarla a pagar. */
export async function extenderRetencion(
  bd: BaseDatos,
  reservaId: string,
  minutos: number,
): Promise<void> {
  await bd
    .update(reservas)
    .set({ retencionExpiraEn: new Date(Date.now() + minutos * 60_000) })
    .where(and(eq(reservas.id, reservaId), eq(reservas.estado, 'pendiente_pago')));
}

/** Bloques de una reserva, en orden. */
export async function bloquesDeReserva(bd: BaseDatos, reservaId: string) {
  return bd
    .select()
    .from(reservasServicios)
    .where(eq(reservasServicios.reservaId, reservaId))
    .orderBy(reservasServicios.orden);
}

/** Reservas por identificador, para el panel y las pruebas. */
export async function reservasPorId(bd: BaseDatos, ids: string[]) {
  if (ids.length === 0) return [];

  return bd.select().from(reservas).where(inArray(reservas.id, ids));
}
