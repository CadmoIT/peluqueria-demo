// Enumerados y utilidades transversales del esquema.
// Los valores replican los contratos de @manly/contratos: si cambia uno, cambian
// los dos y hace falta una migración.
import { sql } from 'drizzle-orm';
import { pgEnum, timestamp } from 'drizzle-orm/pg-core';

/** Ciclo de vida de una reserva. */
export const estadoReserva = pgEnum('estado_reserva', [
  'pendiente_pago',
  'confirmada',
  'cancelada',
  'completada',
  'ausente',
  'expirada',
]);

/** Estados en los que una reserva ocupa la agenda del profesional. */
export const ESTADOS_OCUPAN_AGENDA = ['pendiente_pago', 'confirmada'] as const;

/** Canales por los que se le puede notificar a un cliente. */
export const canalContacto = pgEnum('canal_contacto', ['whatsapp', 'email']);

/** Modalidad de seña configurable por servicio. */
export const modalidadSenia = pgEnum('modalidad_senia', ['deshabilitada', 'fija', 'porcentual']);

/** Roles del panel interno. */
export const rol = pgEnum('rol', ['gerencia', 'profesional']);

/** Qué representa un movimiento de dinero. */
export const tipoPago = pgEnum('tipo_pago', ['senia', 'saldo', 'reintegro']);

/** Medio por el que se cobró o devolvió. */
export const medioPago = pgEnum('medio_pago', [
  'mercado_pago',
  'efectivo',
  'qr_mercado_pago',
  'otro',
]);

export const estadoPago = pgEnum('estado_pago', [
  'pendiente',
  'aprobado',
  'rechazado',
  'cancelado',
  'reintegrado',
]);

/** Qué pide el cliente cuando ya no alcanza el plazo automático. */
export const tipoSolicitud = pgEnum('tipo_solicitud', ['cancelacion', 'reprogramacion']);

export const estadoSolicitud = pgEnum('estado_solicitud', ['pendiente', 'aprobada', 'rechazada']);

/** Qué avisa cada notificación. */
export const tipoNotificacion = pgEnum('tipo_notificacion', [
  'confirmacion',
  'recordatorio_primero',
  'recordatorio_segundo',
  'cancelacion',
  'reprogramacion',
  'solicitud_aprobada',
  'solicitud_rechazada',
]);

export const estadoNotificacion = pgEnum('estado_notificacion', [
  /** Preparada pero esperando un evento: se usa para el aviso que depende del pago. */
  'retenida',
  'pendiente',
  'enviada',
  'fallida',
  'descartada',
]);

/** Qué altera una excepción sobre el horario semanal. */
export const tipoExcepcion = pgEnum('tipo_excepcion', [
  'bloqueo',
  'feriado',
  'disponibilidad_extra',
]);

/**
 * Marcas de tiempo estándar. Siempre `timestamptz`: las fechas se guardan en UTC
 * y se presentan en la zona horaria del negocio.
 */
export const marcasDeTiempo = {
  creadoEn: timestamp('creado_en', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  actualizadoEn: timestamp('actualizado_en', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
};
