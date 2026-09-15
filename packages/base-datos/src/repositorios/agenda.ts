// Agenda del panel: qué hay reservado, en qué franja y con quién.
//
// La agenda se arma sobre `reservas_servicios`, no sobre `reservas`: el bloque
// es la unidad que ocupa a un profesional, y una reserva multiservicio puede
// repartirse entre varios. Se devuelve la franja que ve el cliente y también la
// que ocupa de verdad —con preparación y limpieza—, porque un calendario que
// dibujara sólo la primera mostraría huecos que en realidad no existen.
import { and, asc, eq, gt, inArray, lt, sql } from 'drizzle-orm';

import type { BaseDatos } from '../conexion';
import {
  excepcionesHorario,
  profesionales,
  reservas,
  reservasServicios,
  sucursales,
} from '../esquemas/index';

export interface BloqueDeAgenda {
  reservaId: string;
  bloqueId: string;
  orden: number;
  estado: 'pendiente_pago' | 'confirmada' | 'cancelada' | 'completada' | 'ausente' | 'expirada';
  profesionalId: string;
  profesionalNombre: string;
  servicioNombre: string;
  clienteNombre: string | null;
  contactoWhatsapp: string | null;
  contactoEmail: string | null;
  comienzaEn: Date;
  terminaEn: Date;
  ocupaDesde: Date;
  ocupaHasta: Date;
  precioCentavos: number;
  seniaCentavos: number;
  notas: string | null;
  /** Cuántos bloques tiene la reserva completa, para señalar las multiservicio. */
  bloquesDeLaReserva: number;
}

export interface ConsultaAgenda {
  sucursalId: string;
  desde: Date;
  hasta: Date;
  /** Limita la agenda a un profesional. Es lo que ve alguien con rol profesional. */
  profesionalId?: string | null;
  incluirCanceladas?: boolean;
}

/**
 * Bloques que caen dentro del rango pedido.
 *
 * El solapamiento se mide contra la ventana ocupada: un bloque que empieza
 * antes del rango pero cuya limpieza entra en él sigue ocupando al profesional
 * y tiene que aparecer.
 */
export async function agendaDeSucursal(
  bd: BaseDatos,
  consulta: ConsultaAgenda,
): Promise<BloqueDeAgenda[]> {
  const condiciones = [
    eq(reservas.sucursalId, consulta.sucursalId),
    lt(reservasServicios.ocupaDesde, consulta.hasta),
    gt(reservasServicios.ocupaHasta, consulta.desde),
  ];

  if (consulta.profesionalId) {
    condiciones.push(eq(reservasServicios.profesionalId, consulta.profesionalId));
  }

  if (!consulta.incluirCanceladas) {
    condiciones.push(sql`${reservasServicios.estado} NOT IN ('cancelada', 'expirada')`);
  }

  const filas = await bd
    .select({
      reservaId: reservas.id,
      bloqueId: reservasServicios.id,
      orden: reservasServicios.orden,
      estado: reservasServicios.estado,
      profesionalId: reservasServicios.profesionalId,
      profesionalNombre: profesionales.nombre,
      profesionalNombreVisible: profesionales.nombreVisible,
      servicioNombre: reservasServicios.servicioNombre,
      clienteNombre: reservas.clienteNombre,
      contactoWhatsapp: reservas.contactoWhatsapp,
      contactoEmail: reservas.contactoEmail,
      comienzaEn: reservasServicios.comienzaEn,
      terminaEn: reservasServicios.terminaEn,
      ocupaDesde: reservasServicios.ocupaDesde,
      ocupaHasta: reservasServicios.ocupaHasta,
      precioCentavos: reservasServicios.precioCentavos,
      seniaCentavos: reservasServicios.seniaCentavos,
      notas: reservas.notas,
    })
    .from(reservasServicios)
    .innerJoin(reservas, eq(reservas.id, reservasServicios.reservaId))
    .innerJoin(profesionales, eq(profesionales.id, reservasServicios.profesionalId))
    .where(and(...condiciones))
    .orderBy(asc(reservasServicios.comienzaEn), asc(profesionales.orden));

  // Cuántos bloques tiene cada reserva. Se cuenta aparte porque el rango pedido
  // puede haber recortado alguno, y el calendario necesita saber que el turno
  // sigue más allá del borde de la vista.
  const totales = await contarBloquesPorReserva(
    bd,
    filas.map((fila) => fila.reservaId),
  );

  return filas.map((fila) => ({
    reservaId: fila.reservaId,
    bloqueId: fila.bloqueId,
    orden: fila.orden,
    estado: fila.estado,
    profesionalId: fila.profesionalId,
    profesionalNombre: fila.profesionalNombreVisible ?? fila.profesionalNombre,
    servicioNombre: fila.servicioNombre,
    clienteNombre: fila.clienteNombre,
    contactoWhatsapp: fila.contactoWhatsapp,
    contactoEmail: fila.contactoEmail,
    comienzaEn: fila.comienzaEn,
    terminaEn: fila.terminaEn,
    ocupaDesde: fila.ocupaDesde,
    ocupaHasta: fila.ocupaHasta,
    precioCentavos: fila.precioCentavos,
    seniaCentavos: fila.seniaCentavos,
    notas: fila.notas,
    bloquesDeLaReserva: totales.get(fila.reservaId) ?? 1,
  }));
}

async function contarBloquesPorReserva(
  bd: BaseDatos,
  reservaIds: string[],
): Promise<Map<string, number>> {
  if (reservaIds.length === 0) return new Map();

  const filas = await bd
    .select({ reservaId: reservasServicios.reservaId, total: sql<number>`count(*)::int` })
    .from(reservasServicios)
    .where(inArray(reservasServicios.reservaId, [...new Set(reservaIds)]))
    .groupBy(reservasServicios.reservaId);

  return new Map(filas.map((fila) => [fila.reservaId, fila.total]));
}

/**
 * Marca cómo terminó un turno.
 *
 * Sólo desde `confirmada`: no tiene sentido dar por completado algo que nunca
 * se confirmó, y una reserva ya cancelada no vuelve atrás por esta vía.
 */
export async function marcarAsistencia(
  bd: BaseDatos,
  reservaId: string,
  estado: 'completada' | 'ausente',
): Promise<boolean> {
  const actualizadas = await bd
    .update(reservas)
    .set({ estado, actualizadoEn: new Date() })
    .where(and(eq(reservas.id, reservaId), eq(reservas.estado, 'confirmada')))
    .returning({ id: reservas.id });

  return actualizadas.length > 0;
}

// ── Bloqueos de agenda ───────────────────────────────────────────────────────

export interface Bloqueo {
  id: string;
  profesionalId: string | null;
  profesionalNombre: string | null;
  sucursalId: string | null;
  sucursalNombre: string | null;
  tipo: 'bloqueo' | 'feriado' | 'disponibilidad_extra';
  comienzaEn: Date;
  terminaEn: Date;
  motivo: string | null;
}

/**
 * Reservas vivas que quedarían dentro de un bloqueo.
 *
 * El bloqueo no las cancela ni las mueve: la restricción de exclusión mira
 * reservas contra reservas, así que un bloqueo puesto encima de un turno ya
 * tomado no lo toca. Se devuelven para que gerencia decida qué hacer con ellos.
 */
export async function reservasDentroDelRango(
  bd: BaseDatos,
  rango: { sucursalId: string | null; profesionalId: string | null; desde: Date; hasta: Date },
): Promise<{ reservaId: string; clienteNombre: string | null; comienzaEn: Date }[]> {
  const condiciones = [
    lt(reservasServicios.ocupaDesde, rango.hasta),
    gt(reservasServicios.ocupaHasta, rango.desde),
    sql`${reservasServicios.estado} IN ('pendiente_pago', 'confirmada')`,
  ];

  if (rango.profesionalId) {
    condiciones.push(eq(reservasServicios.profesionalId, rango.profesionalId));
  }

  if (rango.sucursalId) {
    condiciones.push(eq(reservas.sucursalId, rango.sucursalId));
  }

  return bd
    .selectDistinct({
      reservaId: reservas.id,
      clienteNombre: reservas.clienteNombre,
      comienzaEn: reservas.comienzaEn,
    })
    .from(reservasServicios)
    .innerJoin(reservas, eq(reservas.id, reservasServicios.reservaId))
    .where(and(...condiciones))
    .orderBy(asc(reservas.comienzaEn));
}

export async function crearBloqueo(
  bd: BaseDatos,
  datos: {
    profesionalId: string | null;
    sucursalId: string | null;
    tipo: 'bloqueo' | 'feriado' | 'disponibilidad_extra';
    comienzaEn: Date;
    terminaEn: Date;
    motivo: string | null;
  },
): Promise<string> {
  const [creado] = await bd
    .insert(excepcionesHorario)
    .values(datos)
    .returning({ id: excepcionesHorario.id });

  if (!creado) {
    throw new Error('No se pudo crear el bloqueo.');
  }

  return creado.id;
}

export async function listarBloqueos(
  bd: BaseDatos,
  rango: { desde: Date; hasta: Date; sucursalId?: string | null },
): Promise<Bloqueo[]> {
  const condiciones = [
    lt(excepcionesHorario.comienzaEn, rango.hasta),
    gt(excepcionesHorario.terminaEn, rango.desde),
  ];

  if (rango.sucursalId) {
    // Las de alcance global (sucursal en null) rigen para todas, así que entran.
    condiciones.push(
      sql`(${excepcionesHorario.sucursalId} IS NULL OR ${excepcionesHorario.sucursalId} = ${rango.sucursalId})`,
    );
  }

  return bd
    .select({
      id: excepcionesHorario.id,
      profesionalId: excepcionesHorario.profesionalId,
      profesionalNombre: profesionales.nombre,
      sucursalId: excepcionesHorario.sucursalId,
      sucursalNombre: sucursales.nombre,
      tipo: excepcionesHorario.tipo,
      comienzaEn: excepcionesHorario.comienzaEn,
      terminaEn: excepcionesHorario.terminaEn,
      motivo: excepcionesHorario.motivo,
    })
    .from(excepcionesHorario)
    .leftJoin(profesionales, eq(profesionales.id, excepcionesHorario.profesionalId))
    .leftJoin(sucursales, eq(sucursales.id, excepcionesHorario.sucursalId))
    .where(and(...condiciones))
    .orderBy(asc(excepcionesHorario.comienzaEn));
}

/**
 * El alcance de un bloqueo, para decidir quién puede levantarlo.
 *
 * Devuelve sólo las dos referencias y no el bloqueo entero: lo único que hay
 * que preguntarle es de quién es.
 */
export async function alcanceDelBloqueo(
  bd: BaseDatos,
  id: string,
): Promise<{ profesionalId: string | null; sucursalId: string | null } | null> {
  const [fila] = await bd
    .select({
      profesionalId: excepcionesHorario.profesionalId,
      sucursalId: excepcionesHorario.sucursalId,
    })
    .from(excepcionesHorario)
    .where(eq(excepcionesHorario.id, id))
    .limit(1);

  return fila ?? null;
}

export async function borrarBloqueo(bd: BaseDatos, id: string): Promise<boolean> {
  const borrados = await bd
    .delete(excepcionesHorario)
    .where(eq(excepcionesHorario.id, id))
    .returning({ id: excepcionesHorario.id });

  return borrados.length > 0;
}
