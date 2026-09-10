// Altas, bajas y modificaciones del catálogo desde el panel.
//
// Dos reglas gobiernan todo el archivo:
//
//   1. **Nada se borra.** Sucursales, servicios y profesionales se dan de baja
//      con su bandera `activo`. Un DELETE arrastraría reservas históricas o
//      quedaría bloqueado por las claves foráneas, y en los dos casos se
//      perdería el rastro de lo que pasó.
//   2. **Los cambios no alcanzan a las reservas ya tomadas.** Precio, duración
//      y buffers viajan como copia a `reservas_servicios` en el momento de
//      reservar, así que subir un precio hoy no encarece un turno de ayer.
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import type { BaseDatos } from '../conexion';
import {
  configuracionNegocio,
  horariosSemanales,
  profesionales,
  profesionalesServicios,
  profesionalesSucursales,
  servicios,
  serviciosSucursales,
  sucursales,
} from '../esquemas/index';

// ── Sucursales ───────────────────────────────────────────────────────────────

export interface DatosSucursal {
  nombre: string;
  barrio: string;
  direccion: string;
  telefono: string | null;
  whatsapp: string | null;
  urlMapa: string | null;
  horasMinimasCancelacion: number | null;
  activa: boolean;
  orden: number;
}

export interface SucursalAdministrada extends DatosSucursal {
  id: string;
}

/** Incluye las inactivas: el panel administra todo, no sólo lo que se publica. */
export async function listarSucursalesAdmin(bd: BaseDatos): Promise<SucursalAdministrada[]> {
  return bd
    .select({
      id: sucursales.id,
      nombre: sucursales.nombre,
      barrio: sucursales.barrio,
      direccion: sucursales.direccion,
      telefono: sucursales.telefono,
      whatsapp: sucursales.whatsapp,
      urlMapa: sucursales.urlMapa,
      horasMinimasCancelacion: sucursales.horasMinimasCancelacion,
      activa: sucursales.activa,
      orden: sucursales.orden,
    })
    .from(sucursales)
    .orderBy(asc(sucursales.orden), asc(sucursales.nombre));
}

export async function buscarSucursalAdmin(
  bd: BaseDatos,
  id: string,
): Promise<SucursalAdministrada | null> {
  const [fila] = await bd
    .select({
      id: sucursales.id,
      nombre: sucursales.nombre,
      barrio: sucursales.barrio,
      direccion: sucursales.direccion,
      telefono: sucursales.telefono,
      whatsapp: sucursales.whatsapp,
      urlMapa: sucursales.urlMapa,
      horasMinimasCancelacion: sucursales.horasMinimasCancelacion,
      activa: sucursales.activa,
      orden: sucursales.orden,
    })
    .from(sucursales)
    .where(eq(sucursales.id, id))
    .limit(1);

  return fila ?? null;
}

export async function crearSucursal(bd: BaseDatos, datos: DatosSucursal): Promise<string> {
  const [creada] = await bd.insert(sucursales).values(datos).returning({ id: sucursales.id });

  if (!creada) throw new Error('No se pudo crear la sucursal.');

  return creada.id;
}

export async function actualizarSucursal(
  bd: BaseDatos,
  id: string,
  datos: Partial<DatosSucursal>,
): Promise<boolean> {
  const actualizadas = await bd
    .update(sucursales)
    .set({ ...datos, actualizadoEn: new Date() })
    .where(eq(sucursales.id, id))
    .returning({ id: sucursales.id });

  return actualizadas.length > 0;
}

// ── Servicios ────────────────────────────────────────────────────────────────

export interface DatosServicio {
  nombre: string;
  descripcion: string | null;
  categoria: string | null;
  duracionMinutos: number;
  minutosPreparacion: number;
  minutosLimpieza: number;
  precioCentavos: number;
  modalidadSenia: 'deshabilitada' | 'fija' | 'porcentual';
  seniaFijaCentavos: number | null;
  seniaPorcentaje: number | null;
  horasMinimasCancelacion: number | null;
  activo: boolean;
  orden: number;
}

export interface ServicioAdministrado extends DatosServicio {
  id: string;
  sucursalIds: string[];
}

export async function listarServiciosAdmin(bd: BaseDatos): Promise<ServicioAdministrado[]> {
  const filas = await bd
    .select({
      id: servicios.id,
      nombre: servicios.nombre,
      descripcion: servicios.descripcion,
      categoria: servicios.categoria,
      duracionMinutos: servicios.duracionMinutos,
      minutosPreparacion: servicios.minutosPreparacion,
      minutosLimpieza: servicios.minutosLimpieza,
      precioCentavos: servicios.precioCentavos,
      modalidadSenia: servicios.modalidadSenia,
      seniaFijaCentavos: servicios.seniaFijaCentavos,
      seniaPorcentaje: servicios.seniaPorcentaje,
      horasMinimasCancelacion: servicios.horasMinimasCancelacion,
      activo: servicios.activo,
      orden: servicios.orden,
    })
    .from(servicios)
    .orderBy(asc(servicios.orden), asc(servicios.nombre));

  const vinculos = await bd
    .select({
      servicioId: serviciosSucursales.servicioId,
      sucursalId: serviciosSucursales.sucursalId,
    })
    .from(serviciosSucursales);

  return filas.map((fila) => ({
    ...fila,
    sucursalIds: vinculos
      .filter((vinculo) => vinculo.servicioId === fila.id)
      .map((vinculo) => vinculo.sucursalId),
  }));
}

/**
 * Crea el servicio y sus sucursales en una transacción.
 *
 * Si falla el vínculo con las sucursales, el servicio tampoco queda: uno
 * huérfano no aparecería en ninguna búsqueda y sería invisible salvo en el
 * panel.
 */
export async function crearServicio(
  bd: BaseDatos,
  datos: DatosServicio & { sucursalIds: string[] },
): Promise<string> {
  const { sucursalIds, ...campos } = datos;

  return bd.transaction(async (tx) => {
    const [creado] = await tx.insert(servicios).values(campos).returning({ id: servicios.id });

    if (!creado) throw new Error('No se pudo crear el servicio.');

    if (sucursalIds.length > 0) {
      await tx
        .insert(serviciosSucursales)
        .values(sucursalIds.map((sucursalId) => ({ servicioId: creado.id, sucursalId })));
    }

    return creado.id;
  });
}

export async function actualizarServicio(
  bd: BaseDatos,
  id: string,
  datos: Partial<DatosServicio> & { sucursalIds?: string[] },
): Promise<boolean> {
  const { sucursalIds, ...campos } = datos;

  return bd.transaction(async (tx) => {
    const actualizados = await tx
      .update(servicios)
      .set({ ...campos, actualizadoEn: new Date() })
      .where(eq(servicios.id, id))
      .returning({ id: servicios.id });

    if (actualizados.length === 0) return false;

    // Se reemplazan enteros en vez de calcular el diferencial: la tabla
    // intermedia no tiene datos propios, así que no se pierde nada.
    if (sucursalIds) {
      await tx.delete(serviciosSucursales).where(eq(serviciosSucursales.servicioId, id));

      if (sucursalIds.length > 0) {
        await tx
          .insert(serviciosSucursales)
          .values(sucursalIds.map((sucursalId) => ({ servicioId: id, sucursalId })));
      }
    }

    return true;
  });
}

// ── Profesionales ────────────────────────────────────────────────────────────

export interface DatosProfesional {
  nombre: string;
  nombreVisible: string | null;
  activo: boolean;
  orden: number;
}

export interface ProfesionalAdministrado extends DatosProfesional {
  id: string;
  usuarioId: string | null;
  sucursalIds: string[];
  servicioIds: string[];
}

export async function listarProfesionalesAdmin(bd: BaseDatos): Promise<ProfesionalAdministrado[]> {
  const filas = await bd
    .select({
      id: profesionales.id,
      usuarioId: profesionales.usuarioId,
      nombre: profesionales.nombre,
      nombreVisible: profesionales.nombreVisible,
      activo: profesionales.activo,
      orden: profesionales.orden,
    })
    .from(profesionales)
    .orderBy(asc(profesionales.orden), asc(profesionales.nombre));

  const enSucursales = await bd
    .select({
      profesionalId: profesionalesSucursales.profesionalId,
      sucursalId: profesionalesSucursales.sucursalId,
    })
    .from(profesionalesSucursales);

  const conServicios = await bd
    .select({
      profesionalId: profesionalesServicios.profesionalId,
      servicioId: profesionalesServicios.servicioId,
    })
    .from(profesionalesServicios);

  return filas.map((fila) => ({
    ...fila,
    sucursalIds: enSucursales
      .filter((vinculo) => vinculo.profesionalId === fila.id)
      .map((vinculo) => vinculo.sucursalId),
    servicioIds: conServicios
      .filter((vinculo) => vinculo.profesionalId === fila.id)
      .map((vinculo) => vinculo.servicioId),
  }));
}

export async function crearProfesional(
  bd: BaseDatos,
  datos: DatosProfesional & { sucursalIds: string[]; servicioIds: string[] },
): Promise<string> {
  const { sucursalIds, servicioIds, ...campos } = datos;

  return bd.transaction(async (tx) => {
    const [creado] = await tx
      .insert(profesionales)
      .values(campos)
      .returning({ id: profesionales.id });

    if (!creado) throw new Error('No se pudo crear el profesional.');

    if (sucursalIds.length > 0) {
      await tx
        .insert(profesionalesSucursales)
        .values(sucursalIds.map((sucursalId) => ({ profesionalId: creado.id, sucursalId })));
    }

    if (servicioIds.length > 0) {
      await tx
        .insert(profesionalesServicios)
        .values(servicioIds.map((servicioId) => ({ profesionalId: creado.id, servicioId })));
    }

    return creado.id;
  });
}

export async function actualizarProfesional(
  bd: BaseDatos,
  id: string,
  datos: Partial<DatosProfesional> & { sucursalIds?: string[]; servicioIds?: string[] },
): Promise<boolean> {
  const { sucursalIds, servicioIds, ...campos } = datos;

  return bd.transaction(async (tx) => {
    const actualizados = await tx
      .update(profesionales)
      .set({ ...campos, actualizadoEn: new Date() })
      .where(eq(profesionales.id, id))
      .returning({ id: profesionales.id });

    if (actualizados.length === 0) return false;

    if (sucursalIds) {
      await tx.delete(profesionalesSucursales).where(eq(profesionalesSucursales.profesionalId, id));

      if (sucursalIds.length > 0) {
        await tx
          .insert(profesionalesSucursales)
          .values(sucursalIds.map((sucursalId) => ({ profesionalId: id, sucursalId })));
      }
    }

    if (servicioIds) {
      await tx.delete(profesionalesServicios).where(eq(profesionalesServicios.profesionalId, id));

      if (servicioIds.length > 0) {
        await tx
          .insert(profesionalesServicios)
          .values(servicioIds.map((servicioId) => ({ profesionalId: id, servicioId })));
      }
    }

    return true;
  });
}

/** Ata un profesional a su usuario del panel, para que vea su propia agenda. */
export async function vincularProfesionalConUsuario(
  bd: BaseDatos,
  profesionalId: string,
  usuarioId: string | null,
): Promise<boolean> {
  const actualizados = await bd
    .update(profesionales)
    .set({ usuarioId, actualizadoEn: new Date() })
    .where(eq(profesionales.id, profesionalId))
    .returning({ id: profesionales.id });

  return actualizados.length > 0;
}

// ── Horarios semanales ───────────────────────────────────────────────────────

export interface FranjaSemanal {
  id: string;
  profesionalId: string;
  sucursalId: string;
  diaSemana: number;
  comienza: string;
  termina: string;
}

export async function listarHorarios(
  bd: BaseDatos,
  filtros: { profesionalId?: string; sucursalId?: string } = {},
): Promise<FranjaSemanal[]> {
  const condiciones = [];

  if (filtros.profesionalId) {
    condiciones.push(eq(horariosSemanales.profesionalId, filtros.profesionalId));
  }

  if (filtros.sucursalId) {
    condiciones.push(eq(horariosSemanales.sucursalId, filtros.sucursalId));
  }

  const consulta = bd
    .select({
      id: horariosSemanales.id,
      profesionalId: horariosSemanales.profesionalId,
      sucursalId: horariosSemanales.sucursalId,
      diaSemana: horariosSemanales.diaSemana,
      comienza: horariosSemanales.comienza,
      termina: horariosSemanales.termina,
    })
    .from(horariosSemanales);

  return (condiciones.length > 0 ? consulta.where(and(...condiciones)) : consulta).orderBy(
    asc(horariosSemanales.diaSemana),
    asc(horariosSemanales.comienza),
  );
}

/**
 * Reemplaza la semana completa de un profesional en una sucursal.
 *
 * Se hace de una y no franja por franja porque editar un horario suele ser
 * "así queda la semana", no "agregá esta franja": si se aplicara por partes, un
 * fallo a mitad de camino dejaría una semana que nadie quiso.
 *
 * No toca los turnos ya tomados. Sacarle a alguien el jueves a la tarde no
 * cancela lo que ya tenía ese jueves; eso se ve en la agenda y se resuelve a
 * mano.
 */
export async function reemplazarHorarioSemanal(
  bd: BaseDatos,
  parametros: {
    profesionalId: string;
    sucursalId: string;
    franjas: { diaSemana: number; comienza: string; termina: string }[];
  },
): Promise<void> {
  await bd.transaction(async (tx) => {
    await tx
      .delete(horariosSemanales)
      .where(
        and(
          eq(horariosSemanales.profesionalId, parametros.profesionalId),
          eq(horariosSemanales.sucursalId, parametros.sucursalId),
        ),
      );

    if (parametros.franjas.length === 0) return;

    await tx.insert(horariosSemanales).values(
      parametros.franjas.map((franja) => ({
        profesionalId: parametros.profesionalId,
        sucursalId: parametros.sucursalId,
        diaSemana: franja.diaSemana,
        comienza: franja.comienza,
        termina: franja.termina,
      })),
    );
  });
}

// ── Configuración del negocio ────────────────────────────────────────────────

export interface ConfiguracionEditable {
  horasMinimasCancelacion: number;
  minutosRetencion: number;
  diasHorizonte: number;
  maximoServiciosPorReserva: number;
  horasRecordatorioPrimero: number;
  horasRecordatorioSegundo: number | null;
  zonaHoraria: string;
  reservasOnlineActivas: boolean;
  mensajeReservasCerradas: string | null;
}

export async function leerConfiguracion(bd: BaseDatos): Promise<ConfiguracionEditable | null> {
  const [fila] = await bd
    .select({
      horasMinimasCancelacion: configuracionNegocio.horasMinimasCancelacion,
      minutosRetencion: configuracionNegocio.minutosRetencion,
      diasHorizonte: configuracionNegocio.diasHorizonte,
      maximoServiciosPorReserva: configuracionNegocio.maximoServiciosPorReserva,
      horasRecordatorioPrimero: configuracionNegocio.horasRecordatorioPrimero,
      horasRecordatorioSegundo: configuracionNegocio.horasRecordatorioSegundo,
      zonaHoraria: configuracionNegocio.zonaHoraria,
      reservasOnlineActivas: configuracionNegocio.reservasOnlineActivas,
      mensajeReservasCerradas: configuracionNegocio.mensajeReservasCerradas,
    })
    .from(configuracionNegocio)
    .limit(1);

  return fila ?? null;
}

export async function actualizarConfiguracion(
  bd: BaseDatos,
  datos: Partial<ConfiguracionEditable>,
): Promise<boolean> {
  const actualizadas = await bd
    .update(configuracionNegocio)
    .set({ ...datos, actualizadoEn: new Date() })
    .where(eq(configuracionNegocio.filaUnica, true))
    .returning({ id: configuracionNegocio.id });

  return actualizadas.length > 0;
}

/** Nombres por identificador, para mostrar listados sin recorrer tabla por tabla. */
export async function nombresDeProfesionales(
  bd: BaseDatos,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();

  const filas = await bd
    .select({
      id: profesionales.id,
      nombre: profesionales.nombre,
      nombreVisible: profesionales.nombreVisible,
    })
    .from(profesionales)
    .where(inArray(profesionales.id, ids));

  return new Map(filas.map((fila) => [fila.id, fila.nombreVisible ?? fila.nombre]));
}

/** Si el profesional atiende en esa sucursal. Lo usa la reserva manual. */
export async function atiendeEnSucursal(
  bd: BaseDatos,
  profesionalId: string,
  sucursalId: string,
): Promise<boolean> {
  const [fila] = await bd
    .select({ existe: sql<number>`1` })
    .from(profesionalesSucursales)
    .where(
      and(
        eq(profesionalesSucursales.profesionalId, profesionalId),
        eq(profesionalesSucursales.sucursalId, sucursalId),
      ),
    )
    .limit(1);

  return fila !== undefined;
}
