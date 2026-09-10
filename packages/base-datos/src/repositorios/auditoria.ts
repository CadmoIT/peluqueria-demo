// Registro de acciones administrativas.
//
// Sólo se escribe y se lee: no hay forma de editar ni de borrar una fila desde
// acá, y es a propósito. Un registro que se puede retocar no sirve para
// averiguar quién cambió un precio o canceló un turno.
//
// Escribir en auditoría **nunca puede voltear la operación auditada**: si el
// registro falla, la acción ya ocurrió y deshacerla sería peor. Por eso
// `registrarAuditoria` traga el error y lo deja en el log del proceso.
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';

import type { BaseDatos } from '../conexion';
import { auditoria, usuarios } from '../esquemas/index';

export interface EntradaDeAuditoria {
  /** En null cuando la acción la originó el sistema y no una persona. */
  usuarioId: string | null;
  /** Qué se hizo, en pasado: `reserva.cancelada`, `servicio.precio_actualizado`. */
  accion: string;
  entidad: string;
  entidadId: string | null;
  datosAntes?: unknown;
  datosDespues?: unknown;
  direccionIp?: string | null;
}

export interface AuditoriaListada extends EntradaDeAuditoria {
  id: string;
  usuarioNombre: string | null;
  creadoEn: Date;
}

export async function registrarAuditoria(
  bd: BaseDatos,
  entrada: EntradaDeAuditoria,
): Promise<void> {
  try {
    await bd.insert(auditoria).values({
      usuarioId: entrada.usuarioId,
      accion: entrada.accion,
      entidad: entrada.entidad,
      entidadId: entrada.entidadId,
      datosAntes: entrada.datosAntes ?? null,
      datosDespues: entrada.datosDespues ?? null,
      direccionIp: entrada.direccionIp ?? null,
    });
  } catch (error: unknown) {
    // Sin `throw`: la acción auditada ya se hizo y deshacerla porque no se pudo
    // dejar constancia sería el peor de los dos resultados.
    console.error('No se pudo registrar en auditoría:', entrada.accion, error);
  }
}

export interface FiltrosAuditoria {
  entidad?: string;
  entidadId?: string;
  usuarioId?: string;
  accion?: string;
  desde?: Date;
  hasta?: Date;
  pagina?: number;
  porPagina?: number;
}

export async function listarAuditoria(
  bd: BaseDatos,
  filtros: FiltrosAuditoria = {},
): Promise<{ entradas: AuditoriaListada[]; total: number }> {
  const condiciones = [];

  if (filtros.entidad) condiciones.push(eq(auditoria.entidad, filtros.entidad));
  if (filtros.entidadId) condiciones.push(eq(auditoria.entidadId, filtros.entidadId));
  if (filtros.usuarioId) condiciones.push(eq(auditoria.usuarioId, filtros.usuarioId));
  if (filtros.accion) condiciones.push(eq(auditoria.accion, filtros.accion));
  if (filtros.desde) condiciones.push(gte(auditoria.creadoEn, filtros.desde));
  if (filtros.hasta) condiciones.push(lte(auditoria.creadoEn, filtros.hasta));

  const donde = condiciones.length > 0 ? and(...condiciones) : undefined;
  const porPagina = filtros.porPagina ?? 50;
  const pagina = filtros.pagina ?? 1;

  const consulta = bd
    .select({
      id: auditoria.id,
      usuarioId: auditoria.usuarioId,
      usuarioNombre: usuarios.nombre,
      accion: auditoria.accion,
      entidad: auditoria.entidad,
      entidadId: auditoria.entidadId,
      datosAntes: auditoria.datosAntes,
      datosDespues: auditoria.datosDespues,
      direccionIp: auditoria.direccionIp,
      creadoEn: auditoria.creadoEn,
    })
    .from(auditoria)
    .leftJoin(usuarios, eq(usuarios.id, auditoria.usuarioId));

  const entradas = await (donde ? consulta.where(donde) : consulta)
    .orderBy(desc(auditoria.creadoEn))
    .limit(porPagina)
    .offset((pagina - 1) * porPagina);

  const conteo = bd.select({ total: sql<number>`count(*)::int` }).from(auditoria);
  const [fila] = await (donde ? conteo.where(donde) : conteo);

  return { entradas, total: fila?.total ?? 0 };
}
