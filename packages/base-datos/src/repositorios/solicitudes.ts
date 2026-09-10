// Solicitudes de cambio pendientes de resolver.
//
// Llegan acá los pedidos que el cliente hizo cuando ya no quedaba anticipación
// para cancelar o mover solo. Mientras están pendientes **el horario original
// sigue ocupado**: liberarlo antes de decidir dejaría el turno a merced de
// cualquiera y encima habría que devolver la seña igual.
import { and, asc, desc, eq, sql } from 'drizzle-orm';

import type { BaseDatos } from '../conexion';
import { reservas, solicitudesCambio, sucursales, usuarios } from '../esquemas/index';

export type TipoSolicitud = 'cancelacion' | 'reprogramacion';
export type EstadoSolicitud = 'pendiente' | 'aprobada' | 'rechazada';

export interface SolicitudDelPanel {
  id: string;
  tipo: TipoSolicitud;
  estado: EstadoSolicitud;
  motivo: string | null;
  /** Horario que propuso el cliente. Sólo viene en las de reprogramación. */
  propuesta: unknown;
  respuesta: string | null;
  resueltaPor: string | null;
  resueltaEn: Date | null;
  creadoEn: Date;
  reservaId: string;
  reservaEstado:
    'pendiente_pago' | 'confirmada' | 'cancelada' | 'completada' | 'ausente' | 'expirada';
  clienteNombre: string | null;
  contactoWhatsapp: string | null;
  contactoEmail: string | null;
  comienzaEn: Date;
  terminaEn: Date;
  seniaTotalCentavos: number;
  sucursalId: string;
  sucursalNombre: string;
}

const COLUMNAS = {
  id: solicitudesCambio.id,
  tipo: solicitudesCambio.tipo,
  estado: solicitudesCambio.estado,
  motivo: solicitudesCambio.motivo,
  propuesta: solicitudesCambio.propuesta,
  respuesta: solicitudesCambio.respuesta,
  resueltaPor: usuarios.nombre,
  resueltaEn: solicitudesCambio.resueltaEn,
  creadoEn: solicitudesCambio.creadoEn,
  reservaId: reservas.id,
  reservaEstado: reservas.estado,
  clienteNombre: reservas.clienteNombre,
  contactoWhatsapp: reservas.contactoWhatsapp,
  contactoEmail: reservas.contactoEmail,
  comienzaEn: reservas.comienzaEn,
  terminaEn: reservas.terminaEn,
  seniaTotalCentavos: reservas.seniaTotalCentavos,
  sucursalId: sucursales.id,
  sucursalNombre: sucursales.nombre,
};

/**
 * Solicitudes, de la más urgente a la menos.
 *
 * Las pendientes se ordenan por la fecha del turno y no por la del pedido: lo
 * que corre es el turno, y una solicitud sobre algo que es mañana no puede
 * quedar detrás de otra sobre algo del mes que viene.
 */
export async function listarSolicitudes(
  bd: BaseDatos,
  filtros: { estado?: EstadoSolicitud; sucursalId?: string } = {},
): Promise<SolicitudDelPanel[]> {
  const condiciones = [];

  if (filtros.estado) {
    condiciones.push(eq(solicitudesCambio.estado, filtros.estado));
  }

  if (filtros.sucursalId) {
    condiciones.push(eq(reservas.sucursalId, filtros.sucursalId));
  }

  const consulta = bd
    .select(COLUMNAS)
    .from(solicitudesCambio)
    .innerJoin(reservas, eq(reservas.id, solicitudesCambio.reservaId))
    .innerJoin(sucursales, eq(sucursales.id, reservas.sucursalId))
    .leftJoin(usuarios, eq(usuarios.id, solicitudesCambio.resueltaPorUsuarioId));

  const filas = await (condiciones.length > 0 ? consulta.where(and(...condiciones)) : consulta)
    .orderBy(
      // Primero lo que sigue sin resolver.
      sql`case when ${solicitudesCambio.estado} = 'pendiente' then 0 else 1 end`,
      asc(reservas.comienzaEn),
      desc(solicitudesCambio.creadoEn),
    )
    .limit(200);

  return filas;
}

export async function buscarSolicitud(
  bd: BaseDatos,
  id: string,
): Promise<SolicitudDelPanel | null> {
  const [fila] = await bd
    .select(COLUMNAS)
    .from(solicitudesCambio)
    .innerJoin(reservas, eq(reservas.id, solicitudesCambio.reservaId))
    .innerJoin(sucursales, eq(sucursales.id, reservas.sucursalId))
    .leftJoin(usuarios, eq(usuarios.id, solicitudesCambio.resueltaPorUsuarioId))
    .where(eq(solicitudesCambio.id, id))
    .limit(1);

  return fila ?? null;
}

/**
 * Marca la solicitud como resuelta.
 *
 * Exige que siga pendiente en la misma sentencia. Es lo que evita que dos
 * personas del panel resuelvan la misma solicitud al mismo tiempo: la segunda
 * no actualiza ninguna fila y se entera de que llegó tarde.
 */
export async function resolverSolicitud(
  bd: BaseDatos,
  parametros: {
    id: string;
    estado: 'aprobada' | 'rechazada';
    respuesta: string | null;
    usuarioId: string;
  },
): Promise<boolean> {
  const resueltas = await bd
    .update(solicitudesCambio)
    .set({
      estado: parametros.estado,
      respuesta: parametros.respuesta,
      resueltaPorUsuarioId: parametros.usuarioId,
      resueltaEn: new Date(),
      actualizadoEn: new Date(),
    })
    .where(and(eq(solicitudesCambio.id, parametros.id), eq(solicitudesCambio.estado, 'pendiente')))
    .returning({ id: solicitudesCambio.id });

  return resueltas.length > 0;
}

/** Cuántas solicitudes esperan resolución. Alimenta el aviso del panel. */
export async function contarSolicitudesPendientes(bd: BaseDatos): Promise<number> {
  const [fila] = await bd
    .select({ total: sql<number>`count(*)::int` })
    .from(solicitudesCambio)
    .where(eq(solicitudesCambio.estado, 'pendiente'));

  return fila?.total ?? 0;
}
