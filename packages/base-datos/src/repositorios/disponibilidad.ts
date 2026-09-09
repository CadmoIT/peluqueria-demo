// Consultas que alimentan el motor de disponibilidad.
//
// El motor es lógica pura sobre estructuras en memoria; acá se arma todo lo que
// necesita en la menor cantidad de consultas posible.
import { and, eq, gt, inArray, lt, or, sql } from 'drizzle-orm';

import type { BaseDatos } from '../conexion';
import {
  configuracionNegocio,
  excepcionesHorario,
  horariosSemanales,
  profesionales,
  profesionalesServicios,
  profesionalesSucursales,
  reservas,
  reservasServicios,
  servicios,
  serviciosSucursales,
} from '../esquemas/index';

export interface RangoConsulta {
  desde: Date;
  hasta: Date;
}

export interface ServicioDisponible {
  id: string;
  nombre: string;
  duracionMinutos: number;
  minutosPreparacion: number;
  minutosLimpieza: number;
  precioCentavos: number;
  modalidadSenia: 'deshabilitada' | 'fija' | 'porcentual';
  seniaFijaCentavos: number | null;
  seniaPorcentaje: number | null;
}

export interface ContextoDisponibilidad {
  configuracion: {
    minutosRetencion: number;
    diasHorizonte: number;
    maximoServiciosPorReserva: number;
    zonaHoraria: string;
  };
  servicios: ServicioDisponible[];
  /** Nombre visible de cada profesional activo de la sucursal. */
  nombresProfesionales: Map<string, string>;
  /** Profesionales que pueden prestar cada servicio en esta sucursal. */
  compatiblesPorServicio: Map<string, string[]>;
  horarios: {
    profesionalId: string;
    sucursalId: string;
    diaSemana: number;
    comienza: string;
    termina: string;
  }[];
  excepciones: {
    profesionalId: string | null;
    sucursalId: string | null;
    tipo: 'bloqueo' | 'feriado' | 'disponibilidad_extra';
    comienzaEn: Date;
    terminaEn: Date;
  }[];
  /** Ventanas ya tomadas en la agenda de cada profesional. */
  ocupadoPorProfesional: Map<string, { desde: number; hasta: number }[]>;
}

/** Valores por defecto si todavía no se creó la fila de configuración. */
const CONFIGURACION_POR_DEFECTO = {
  minutosRetencion: 10,
  diasHorizonte: 60,
  maximoServiciosPorReserva: 4,
  zonaHoraria: 'America/Argentina/Buenos_Aires',
};

/**
 * Trae todo lo que el motor necesita para una sucursal, un conjunto de
 * servicios y una ventana de tiempo.
 */
export async function cargarContextoDisponibilidad(
  bd: BaseDatos,
  parametros: { sucursalId: string; servicioIds: string[]; rango: RangoConsulta },
): Promise<ContextoDisponibilidad> {
  const { sucursalId, servicioIds, rango } = parametros;

  const [filaConfiguracion] = await bd.select().from(configuracionNegocio).limit(1);

  const configuracion = filaConfiguracion
    ? {
        minutosRetencion: filaConfiguracion.minutosRetencion,
        diasHorizonte: filaConfiguracion.diasHorizonte,
        maximoServiciosPorReserva: filaConfiguracion.maximoServiciosPorReserva,
        zonaHoraria: filaConfiguracion.zonaHoraria,
      }
    : CONFIGURACION_POR_DEFECTO;

  if (servicioIds.length === 0) {
    return {
      configuracion,
      servicios: [],
      nombresProfesionales: new Map(),
      compatiblesPorServicio: new Map(),
      horarios: [],
      excepciones: [],
      ocupadoPorProfesional: new Map(),
    };
  }

  // Servicios activos que además se presten en esta sucursal.
  const filasServicios = await bd
    .select({
      id: servicios.id,
      nombre: servicios.nombre,
      duracionMinutos: servicios.duracionMinutos,
      minutosPreparacion: servicios.minutosPreparacion,
      minutosLimpieza: servicios.minutosLimpieza,
      precioCentavos: servicios.precioCentavos,
      modalidadSenia: servicios.modalidadSenia,
      seniaFijaCentavos: servicios.seniaFijaCentavos,
      seniaPorcentaje: servicios.seniaPorcentaje,
    })
    .from(servicios)
    .innerJoin(serviciosSucursales, eq(serviciosSucursales.servicioId, servicios.id))
    .where(
      and(
        inArray(servicios.id, servicioIds),
        eq(servicios.activo, true),
        eq(serviciosSucursales.sucursalId, sucursalId),
      ),
    );

  // Profesionales activos que atienden en la sucursal.
  const filasProfesionales = await bd
    .select({
      id: profesionales.id,
      nombre: profesionales.nombre,
      nombreVisible: profesionales.nombreVisible,
    })
    .from(profesionales)
    .innerJoin(profesionalesSucursales, eq(profesionalesSucursales.profesionalId, profesionales.id))
    .where(and(eq(profesionales.activo, true), eq(profesionalesSucursales.sucursalId, sucursalId)));

  const nombresProfesionales = new Map(
    filasProfesionales.map((fila) => [fila.id, fila.nombreVisible ?? fila.nombre]),
  );
  const profesionalIds = [...nombresProfesionales.keys()];

  const compatiblesPorServicio = new Map<string, string[]>(
    filasServicios.map((servicio) => [servicio.id, []]),
  );

  if (profesionalIds.length > 0) {
    const filasCompatibles = await bd
      .select({
        servicioId: profesionalesServicios.servicioId,
        profesionalId: profesionalesServicios.profesionalId,
      })
      .from(profesionalesServicios)
      .where(
        and(
          inArray(profesionalesServicios.servicioId, servicioIds),
          inArray(profesionalesServicios.profesionalId, profesionalIds),
        ),
      );

    for (const fila of filasCompatibles) {
      compatiblesPorServicio.get(fila.servicioId)?.push(fila.profesionalId);
    }
  }

  const horarios =
    profesionalIds.length === 0
      ? []
      : await bd
          .select({
            profesionalId: horariosSemanales.profesionalId,
            sucursalId: horariosSemanales.sucursalId,
            diaSemana: horariosSemanales.diaSemana,
            comienza: horariosSemanales.comienza,
            termina: horariosSemanales.termina,
          })
          .from(horariosSemanales)
          .where(
            and(
              eq(horariosSemanales.sucursalId, sucursalId),
              inArray(horariosSemanales.profesionalId, profesionalIds),
            ),
          );

  // Excepciones que tocan la ventana pedida, tanto de la sucursal como globales.
  const excepciones = await bd
    .select({
      profesionalId: excepcionesHorario.profesionalId,
      sucursalId: excepcionesHorario.sucursalId,
      tipo: excepcionesHorario.tipo,
      comienzaEn: excepcionesHorario.comienzaEn,
      terminaEn: excepcionesHorario.terminaEn,
    })
    .from(excepcionesHorario)
    .where(
      and(
        lt(excepcionesHorario.comienzaEn, rango.hasta),
        gt(excepcionesHorario.terminaEn, rango.desde),
        or(
          eq(excepcionesHorario.sucursalId, sucursalId),
          sql`${excepcionesHorario.sucursalId} IS NULL`,
        ),
      ),
    );

  const ocupadoPorProfesional = new Map<string, { desde: number; hasta: number }[]>(
    profesionalIds.map((id) => [id, []]),
  );

  if (profesionalIds.length > 0) {
    // Se cuentan las confirmadas y las que todavía retienen el horario.
    // Una reserva pendiente cuya retención ya venció no ocupa nada, aunque el
    // worker todavía no la haya marcado como expirada.
    const bloquesOcupados = await bd
      .select({
        profesionalId: reservasServicios.profesionalId,
        ocupaDesde: reservasServicios.ocupaDesde,
        ocupaHasta: reservasServicios.ocupaHasta,
      })
      .from(reservasServicios)
      .innerJoin(reservas, eq(reservas.id, reservasServicios.reservaId))
      .where(
        and(
          inArray(reservasServicios.profesionalId, profesionalIds),
          lt(reservasServicios.ocupaDesde, rango.hasta),
          gt(reservasServicios.ocupaHasta, rango.desde),
          or(
            eq(reservas.estado, 'confirmada'),
            and(
              eq(reservas.estado, 'pendiente_pago'),
              sql`${reservas.retencionExpiraEn} IS NOT NULL AND ${reservas.retencionExpiraEn} > now()`,
            ),
          ),
        ),
      );

    for (const bloque of bloquesOcupados) {
      ocupadoPorProfesional.get(bloque.profesionalId)?.push({
        desde: bloque.ocupaDesde.getTime(),
        hasta: bloque.ocupaHasta.getTime(),
      });
    }
  }

  return {
    configuracion,
    servicios: filasServicios,
    nombresProfesionales,
    compatiblesPorServicio,
    horarios,
    excepciones,
    ocupadoPorProfesional,
  };
}

/** Calcula la seña de un servicio según su modalidad. */
export function calcularSenia(servicio: ServicioDisponible): number {
  switch (servicio.modalidadSenia) {
    case 'fija':
      return servicio.seniaFijaCentavos ?? 0;
    case 'porcentual':
      return Math.round((servicio.precioCentavos * (servicio.seniaPorcentaje ?? 0)) / 100);
    case 'deshabilitada':
    default:
      return 0;
  }
}
