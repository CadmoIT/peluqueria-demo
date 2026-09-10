// Contratos del panel interno.
//
// Todo lo de acá exige sesión. Los rangos de fecha llegan como ISO en UTC: la
// conversión desde la hora del local la hace el navegador, que es el único que
// sabe en qué huso está mirando quien usa el panel.
import { z } from 'zod';

import { esquemaEstadoReserva, esquemaId, esquemaModalidadSenia, esquemaRol } from './comunes';
import { esquemaBloqueElegido } from './reservas';

// ── Agenda ───────────────────────────────────────────────────────────────────

export const esquemaConsultaAgenda = z.object({
  sucursalId: esquemaId,
  desde: z.string().datetime(),
  hasta: z.string().datetime(),
  /** Limita la vista a un profesional. Se fuerza para el rol `profesional`. */
  profesionalId: esquemaId.optional(),
  incluirCanceladas: z.coerce.boolean().optional(),
});
export type ConsultaAgendaPanel = z.infer<typeof esquemaConsultaAgenda>;

export const esquemaBloqueAgenda = z.object({
  reservaId: esquemaId,
  bloqueId: esquemaId,
  orden: z.number().int(),
  estado: esquemaEstadoReserva,
  profesionalId: esquemaId,
  profesionalNombre: z.string(),
  servicioNombre: z.string(),
  clienteNombre: z.string().nullable(),
  contactoWhatsapp: z.string().nullable(),
  contactoEmail: z.string().nullable(),
  comienzaEn: z.string().datetime(),
  terminaEn: z.string().datetime(),
  /** Incluye preparación y limpieza: es lo que de verdad ocupa al profesional. */
  ocupaDesde: z.string().datetime(),
  ocupaHasta: z.string().datetime(),
  precioCentavos: z.number().int(),
  seniaCentavos: z.number().int(),
  notas: z.string().nullable(),
  bloquesDeLaReserva: z.number().int(),
});
export type BloqueAgenda = z.infer<typeof esquemaBloqueAgenda>;

export const esquemaAsistencia = z.object({
  estado: z.enum(['completada', 'ausente']),
});
export type Asistencia = z.infer<typeof esquemaAsistencia>;

// ── Bloqueos de agenda ───────────────────────────────────────────────────────

export const tiposBloqueo = ['bloqueo', 'feriado', 'disponibilidad_extra'] as const;
export const esquemaTipoBloqueo = z.enum(tiposBloqueo);

export const esquemaNuevoBloqueo = z
  .object({
    /** En null alcanza a todos los profesionales de la sucursal. */
    profesionalId: esquemaId.nullable().default(null),
    /** En null alcanza a todas las sucursales: sirve para un feriado. */
    sucursalId: esquemaId.nullable().default(null),
    tipo: esquemaTipoBloqueo.default('bloqueo'),
    comienzaEn: z.string().datetime(),
    terminaEn: z.string().datetime(),
    motivo: z.string().trim().max(200).nullable().default(null),
  })
  .refine((datos) => datos.profesionalId !== null || datos.sucursalId !== null, {
    message: 'El bloqueo tiene que apuntar a un profesional o a una sucursal.',
    path: ['sucursalId'],
  })
  .refine((datos) => new Date(datos.comienzaEn) < new Date(datos.terminaEn), {
    message: 'El bloqueo tiene que terminar después de empezar.',
    path: ['terminaEn'],
  });
export type NuevoBloqueo = z.infer<typeof esquemaNuevoBloqueo>;

export const esquemaBloqueoCreado = z.object({
  id: esquemaId,
  /**
   * Turnos que quedaron dentro del bloqueo.
   *
   * El bloqueo no los cancela: sólo tapa la disponibilidad futura. Se devuelven
   * para que gerencia los resuelva a mano.
   */
  reservasAfectadas: z.array(
    z.object({
      reservaId: esquemaId,
      clienteNombre: z.string().nullable(),
      comienzaEn: z.string().datetime(),
    }),
  ),
});
export type BloqueoCreado = z.infer<typeof esquemaBloqueoCreado>;

// ── Solicitudes ──────────────────────────────────────────────────────────────

export const esquemaResolucionSolicitud = z
  .object({
    decision: z.enum(['aprobar', 'rechazar']),
    respuesta: z.string().trim().max(500).nullable().default(null),
  })
  .refine((datos) => datos.decision === 'aprobar' || (datos.respuesta?.length ?? 0) > 0, {
    // Rechazar sin explicar deja al cliente sin saber qué pasó y al local sin
    // registro de por qué se decidió así.
    message: 'Al rechazar hay que dejar el motivo.',
    path: ['respuesta'],
  });
export type ResolucionSolicitud = z.infer<typeof esquemaResolucionSolicitud>;

export const esquemaSolicitudPanel = z.object({
  id: esquemaId,
  tipo: z.enum(['cancelacion', 'reprogramacion']),
  estado: z.enum(['pendiente', 'aprobada', 'rechazada']),
  motivo: z.string().nullable(),
  propuesta: z.unknown(),
  respuesta: z.string().nullable(),
  resueltaPor: z.string().nullable(),
  resueltaEn: z.string().datetime().nullable(),
  creadoEn: z.string().datetime(),
  reservaId: esquemaId,
  reservaEstado: esquemaEstadoReserva,
  clienteNombre: z.string().nullable(),
  comienzaEn: z.string().datetime(),
  terminaEn: z.string().datetime(),
  seniaTotalCentavos: z.number().int(),
  sucursalId: esquemaId,
  sucursalNombre: z.string(),
});
export type SolicitudPanel = z.infer<typeof esquemaSolicitudPanel>;

// ── Reserva manual ───────────────────────────────────────────────────────────

/**
 * Turno cargado desde el mostrador o por teléfono.
 *
 * Nace confirmada y sin seña: la persona ya está ahí o ya habló con el local,
 * así que hacerla pasar por el pago no tendría sentido. El contacto es opcional
 * por lo mismo —un turno tomado por teléfono puede no dejar más que un nombre—,
 * pero sin él tampoco se le puede mandar ningún aviso.
 */
export const esquemaReservaManual = z.object({
  sucursalId: esquemaId,
  bloques: z.array(esquemaBloqueElegido).min(1).max(4),
  clienteNombre: z.string().trim().min(2, 'Poné al menos el nombre.').max(80),
  contactoWhatsapp: z.string().trim().max(30).nullable().default(null),
  contactoEmail: z.string().trim().email().nullable().default(null),
  notas: z.string().trim().max(500).nullable().default(null),
  /** Si se le manda el aviso de confirmación. Requiere algún contacto cargado. */
  avisar: z.boolean().default(false),
});
export type ReservaManual = z.infer<typeof esquemaReservaManual>;

// ── Detalle de una reserva ───────────────────────────────────────────────────

export const esquemaMovimientoPago = z.object({
  id: esquemaId,
  tipo: z.enum(['senia', 'saldo', 'reintegro']),
  medio: z.enum(['mercado_pago', 'efectivo', 'qr_mercado_pago', 'otro']),
  estado: z.enum(['pendiente', 'aprobado', 'rechazado', 'cancelado', 'reintegrado']),
  montoCentavos: z.number().int(),
  acreditadoEn: z.string().datetime().nullable(),
  creadoEn: z.string().datetime(),
});
export type MovimientoPago = z.infer<typeof esquemaMovimientoPago>;

export const esquemaReservaDetallePanel = z.object({
  id: esquemaId,
  estado: esquemaEstadoReserva,
  sucursalId: esquemaId,
  sucursalNombre: z.string(),
  clienteNombre: z.string().nullable(),
  canalContacto: z.enum(['whatsapp', 'email']).nullable(),
  contactoWhatsapp: z.string().nullable(),
  contactoEmail: z.string().nullable(),
  comienzaEn: z.string().datetime(),
  terminaEn: z.string().datetime(),
  precioTotalCentavos: z.number().int(),
  seniaTotalCentavos: z.number().int(),
  /** Suma de lo aprobado menos los reintegros. Es lo que de verdad entró. */
  cobradoCentavos: z.number().int(),
  bloques: z.array(
    z.object({
      orden: z.number().int(),
      servicioNombre: z.string(),
      profesionalNombre: z.string(),
      comienzaEn: z.string().datetime(),
      terminaEn: z.string().datetime(),
      precioCentavos: z.number().int(),
    }),
  ),
  pagos: z.array(esquemaMovimientoPago),
});
export type ReservaDetallePanel = z.infer<typeof esquemaReservaDetallePanel>;

// ── Sucursales ───────────────────────────────────────────────────────────────

export const esquemaDatosSucursal = z.object({
  nombre: z.string().trim().min(2).max(80),
  barrio: z.string().trim().min(2).max(80),
  direccion: z.string().trim().min(4).max(200),
  telefono: z.string().trim().max(40).nullable().default(null),
  /** Formato internacional sin signos, para armar enlaces de wa.me. */
  whatsapp: z.string().trim().max(20).nullable().default(null),
  urlMapa: z.string().trim().url().max(500).nullable().default(null),
  horasMinimasCancelacion: z.number().int().min(0).max(720).nullable().default(null),
  activa: z.boolean().default(true),
  orden: z.number().int().min(0).default(0),
});
export type DatosSucursalPanel = z.infer<typeof esquemaDatosSucursal>;

export const esquemaCambioSucursal = esquemaDatosSucursal.partial();
export type CambioSucursal = z.infer<typeof esquemaCambioSucursal>;

// ── Servicios ────────────────────────────────────────────────────────────────

/**
 * La coherencia de la seña se valida acá y también en la base.
 *
 * Duplicarla no sobra: acá el error se explica en castellano y con el campo
 * señalado, y la restricción de la base es la garantía de que ninguna otra vía
 * —una migración, un script, un cambio a mano— pueda dejar un servicio con una
 * seña fija sin monto.
 */
export const esquemaDatosServicio = z
  .object({
    nombre: z.string().trim().min(2).max(80),
    descripcion: z.string().trim().max(500).nullable().default(null),
    categoria: z.string().trim().max(60).nullable().default(null),
    duracionMinutos: z.number().int().min(5).max(480),
    minutosPreparacion: z.number().int().min(0).max(120).default(0),
    minutosLimpieza: z.number().int().min(0).max(120).default(0),
    precioCentavos: z.number().int().min(0),
    modalidadSenia: esquemaModalidadSenia.default('deshabilitada'),
    seniaFijaCentavos: z.number().int().positive().nullable().default(null),
    seniaPorcentaje: z.number().int().min(1).max(100).nullable().default(null),
    horasMinimasCancelacion: z.number().int().min(0).max(720).nullable().default(null),
    activo: z.boolean().default(true),
    orden: z.number().int().min(0).default(0),
    sucursalIds: z.array(esquemaId).default([]),
  })
  .superRefine((datos, contexto) => {
    if (datos.modalidadSenia === 'fija' && datos.seniaFijaCentavos === null) {
      contexto.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Con seña fija hay que indicar el monto.',
        path: ['seniaFijaCentavos'],
      });
    }

    if (datos.modalidadSenia === 'porcentual' && datos.seniaPorcentaje === null) {
      contexto.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Con seña porcentual hay que indicar el porcentaje.',
        path: ['seniaPorcentaje'],
      });
    }

    if (datos.modalidadSenia === 'deshabilitada') {
      if (datos.seniaFijaCentavos !== null || datos.seniaPorcentaje !== null) {
        contexto.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Sin seña no corresponde cargar monto ni porcentaje.',
          path: ['modalidadSenia'],
        });
      }
    }
  });
export type DatosServicioPanel = z.infer<typeof esquemaDatosServicio>;

// ── Profesionales ────────────────────────────────────────────────────────────

export const esquemaDatosProfesional = z.object({
  nombre: z.string().trim().min(2).max(80),
  /** Cómo se lo presenta al cliente. En null se muestra el nombre. */
  nombreVisible: z.string().trim().max(80).nullable().default(null),
  activo: z.boolean().default(true),
  orden: z.number().int().min(0).default(0),
  sucursalIds: z.array(esquemaId).default([]),
  servicioIds: z.array(esquemaId).default([]),
});
export type DatosProfesionalPanel = z.infer<typeof esquemaDatosProfesional>;

// ── Horarios semanales ───────────────────────────────────────────────────────

/** Hora del local en formato `HH:MM`. Un horario semanal no tiene fecha. */
export const esquemaHoraLocal = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'La hora va como HH:MM.');

export const esquemaFranjaSemanal = z
  .object({
    /** 0 es domingo y 6 es sábado, igual que `Date.getDay()`. */
    diaSemana: z.number().int().min(0).max(6),
    comienza: esquemaHoraLocal,
    termina: esquemaHoraLocal,
  })
  .refine((franja) => franja.comienza < franja.termina, {
    message: 'La franja tiene que terminar después de empezar.',
    path: ['termina'],
  });

/**
 * La semana entera de un profesional en una sucursal.
 *
 * Se manda completa y reemplaza lo que había. Editar franja por franja abriría
 * la puerta a dejar media semana aplicada si algo falla en el medio.
 */
export const esquemaHorarioSemanal = z
  .object({
    profesionalId: esquemaId,
    sucursalId: esquemaId,
    franjas: z.array(esquemaFranjaSemanal).max(30),
  })
  .refine((datos) => !haySolapamiento(datos.franjas), {
    message: 'Hay franjas del mismo día que se pisan.',
    path: ['franjas'],
  });
export type HorarioSemanal = z.infer<typeof esquemaHorarioSemanal>;

function haySolapamiento(franjas: { diaSemana: number; comienza: string; termina: string }[]) {
  return [...franjas]
    .sort((a, b) => a.diaSemana - b.diaSemana || a.comienza.localeCompare(b.comienza))
    .some((franja, indice, ordenadas) => {
      const anterior = ordenadas[indice - 1];

      return (
        anterior !== undefined &&
        anterior.diaSemana === franja.diaSemana &&
        anterior.termina > franja.comienza
      );
    });
}

// ── Configuración del negocio ────────────────────────────────────────────────

export const esquemaConfiguracionNegocio = z.object({
  horasMinimasCancelacion: z.number().int().min(0).max(720),
  minutosRetencion: z.number().int().min(1).max(120),
  diasHorizonte: z.number().int().min(1).max(365),
  maximoServiciosPorReserva: z.number().int().min(1).max(10),
  horasRecordatorioPrimero: z.number().int().min(0).max(168),
  horasRecordatorioSegundo: z.number().int().min(0).max(168).nullable(),
  zonaHoraria: z.string().min(3).max(60),
  /**
   * Interruptor de reservas online.
   *
   * Apagarlo no toca lo ya reservado: los turnos siguen, el enlace de gestión
   * sigue funcionando y el panel sigue pudiendo cargar a mano. Sólo deja de
   * tomarse turnos nuevos desde la web.
   */
  reservasOnlineActivas: z.boolean(),
  mensajeReservasCerradas: z.string().trim().max(300).nullable(),
});
export type ConfiguracionNegocio = z.infer<typeof esquemaConfiguracionNegocio>;

/** Lo que el sitio público necesita saber antes de mostrar el flujo de reserva. */
export const esquemaConfiguracionPublica = z.object({
  reservasOnlineActivas: z.boolean(),
  mensajeReservasCerradas: z.string().nullable(),
});
export type ConfiguracionPublica = z.infer<typeof esquemaConfiguracionPublica>;

export const esquemaCambioConfiguracion = esquemaConfiguracionNegocio.partial();
export type CambioConfiguracion = z.infer<typeof esquemaCambioConfiguracion>;

// ── Usuarios del panel ───────────────────────────────────────────────────────

export const esquemaUsuarioPanel = z.object({
  id: esquemaId,
  nombre: z.string(),
  email: z.string(),
  rol: esquemaRol,
  activo: z.boolean(),
  /** Falso mientras no aceptó la invitación: todavía no puede entrar. */
  acceso: z.boolean(),
  profesionalId: esquemaId.nullable(),
});
export type UsuarioPanel = z.infer<typeof esquemaUsuarioPanel>;

export const esquemaCambioActivo = z.object({ activo: z.boolean() });
export type CambioActivo = z.infer<typeof esquemaCambioActivo>;

// ── Auditoría ────────────────────────────────────────────────────────────────

export const esquemaFiltrosAuditoria = z.object({
  entidad: z.string().trim().max(60).optional(),
  entidadId: esquemaId.optional(),
  usuarioId: esquemaId.optional(),
  accion: z.string().trim().max(60).optional(),
  desde: z.string().datetime().optional(),
  hasta: z.string().datetime().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(200).default(50),
});
export type FiltrosAuditoriaPanel = z.infer<typeof esquemaFiltrosAuditoria>;

export const esquemaEntradaAuditoria = z.object({
  id: esquemaId,
  usuarioId: esquemaId.nullable(),
  usuarioNombre: z.string().nullable(),
  accion: z.string(),
  entidad: z.string(),
  entidadId: esquemaId.nullable(),
  datosAntes: z.unknown(),
  datosDespues: z.unknown(),
  creadoEn: z.string().datetime(),
});
export type EntradaAuditoria = z.infer<typeof esquemaEntradaAuditoria>;

// ── Fallas operativas ────────────────────────────────────────────────────────

/**
 * Avisos que no llegaron.
 *
 * Es la pantalla que evita el peor caso silencioso del sistema: un cliente que
 * nunca se enteró de que su turno cambió y nadie en el local lo supo tampoco.
 */
export const esquemaFallaOperativa = z.object({
  id: esquemaId,
  reservaId: esquemaId.nullable(),
  clienteNombre: z.string().nullable(),
  tipo: z.string(),
  canal: z.string(),
  destino: z.string().nullable(),
  intentos: z.number().int(),
  ultimoError: z.string().nullable(),
  comienzaEn: z.string().datetime().nullable(),
  actualizadoEn: z.string().datetime(),
});
export type FallaOperativa = z.infer<typeof esquemaFallaOperativa>;

// ── Diagnóstico del sistema ──────────────────────────────────────────────────

/**
 * Una señal, con su lectura.
 *
 * El `detalle` no sobra: un tablero que muestra `3` sin decir si tres está bien
 * obliga a saberse el sistema de memoria, y quien mira esto a las nueve de la
 * mañana de un lunes no se lo sabe.
 */
export const esquemaSenalDiagnostico = z.object({
  clave: z.string(),
  titulo: z.string(),
  estado: z.enum(['bien', 'atencion', 'mal']),
  detalle: z.string(),
});
export type SenalDiagnostico = z.infer<typeof esquemaSenalDiagnostico>;

export const esquemaDiagnostico = z.object({
  entorno: z.enum(['produccion', 'no-produccion']),
  version: z.string(),
  senales: z.array(esquemaSenalDiagnostico),
  resumen: z.object({
    reservasProximas: z.number().int(),
    pagosSinConciliar: z.number().int(),
    notificacionesRetenidas: z.number().int(),
  }),
  marcaTiempo: z.string().datetime(),
});
export type Diagnostico = z.infer<typeof esquemaDiagnostico>;
