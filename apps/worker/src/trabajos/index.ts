// Nombres de las colas de trabajo. Se centralizan acá para que el planificador
// y los procesadores no se desincronicen por una cadena mal escrita.
export const COLAS = {
  /** Libera los bloques de una reserva cuya retención de 10 minutos venció. */
  expirarRetenciones: 'reservas.expirar-retenciones',
  /** Envía el recordatorio configurado 24 horas antes del turno. */
  recordatorioPrimero: 'notificaciones.recordatorio-primero',
  /** Envía el segundo recordatorio configurable (por defecto, 2 horas antes). */
  recordatorioSegundo: 'notificaciones.recordatorio-segundo',
  /** Reintenta las notificaciones pendientes de la bandeja de salida. */
  despacharBandejaSalida: 'notificaciones.despachar-bandeja-salida',
  /** Vuelve a consultar los pagos que quedaron sin resolver. */
  reconciliarPagos: 'pagos.reconciliar',
} as const;

export type NombreCola = (typeof COLAS)[keyof typeof COLAS];
