// Contratos de pagos.
//
// Manly no toca datos de tarjeta: el cobro ocurre entero dentro de Checkout Pro
// de Mercado Pago. De acá sólo sale el enlace al que se redirige a la persona,
// y vuelve el resultado por webhook.
import { z } from 'zod';

import { esquemaId } from './comunes';

export const esquemaPedidoPreferencia = z.object({
  /** Token de la reserva retenida que se va a pagar. */
  token: z.string().min(10),
});
export type PedidoPreferencia = z.infer<typeof esquemaPedidoPreferencia>;

export const esquemaPreferenciaCreada = z.object({
  /** Identificador de la preferencia en Mercado Pago. */
  preferenciaId: z.string(),
  /** URL a la que se redirige para pagar. */
  urlPago: z.string().url(),
  montoCentavos: z.number().int().positive(),
  /** Hasta cuándo se sostiene el horario mientras se paga. */
  retencionExpiraEn: z.string().datetime(),
});
export type PreferenciaCreada = z.infer<typeof esquemaPreferenciaCreada>;

/** Estados en los que puede quedar el pago de una seña. */
export const estadosPagoSenia = ['pendiente', 'aprobado', 'rechazado', 'cancelado'] as const;
export const esquemaEstadoPagoSenia = z.enum(estadosPagoSenia);
export type EstadoPagoSenia = z.infer<typeof esquemaEstadoPagoSenia>;

/** Lo que la web consulta al volver de Checkout Pro. */
export const esquemaEstadoDelPago = z.object({
  reservaId: esquemaId,
  /** Estado de la reserva, que es lo que de verdad importa mostrar. */
  reservaConfirmada: z.boolean(),
  estadoPago: esquemaEstadoPagoSenia.nullable(),
  /**
   * La notificación todavía no llegó. La web sigue consultando en vez de dar
   * el pago por perdido: el webhook puede demorar.
   */
  esperandoConfirmacion: z.boolean(),
  mensaje: z.string(),
});
export type EstadoDelPago = z.infer<typeof esquemaEstadoDelPago>;

// ── Panel ────────────────────────────────────────────────────────────────────

/** Medios con los que gerencia registra un cobro presencial. */
export const mediosPresenciales = ['efectivo', 'qr_mercado_pago', 'otro'] as const;
export const esquemaMedioPresencial = z.enum(mediosPresenciales);

export const esquemaPagoPresencial = z.object({
  reservaId: esquemaId,
  medio: esquemaMedioPresencial,
  montoCentavos: z.number().int().positive(),
  /** `senia` cuando se cobra por adelantado en el local; `saldo` al terminar. */
  tipo: z.enum(['senia', 'saldo']),
});
export type PagoPresencial = z.infer<typeof esquemaPagoPresencial>;

/**
 * Reintegro. Nunca es automático: siempre lo dispara gerencia y hay que
 * confirmarlo explícitamente.
 */
export const esquemaReintegro = z.object({
  reservaId: esquemaId,
  montoCentavos: z.number().int().positive(),
  /** Obliga a un segundo acto deliberado antes de mover dinero. */
  confirmacion: z.literal(true, {
    errorMap: () => ({ message: 'Hay que confirmar el reintegro explícitamente.' }),
  }),
  motivo: z.string().trim().max(300).optional(),
});
export type Reintegro = z.infer<typeof esquemaReintegro>;
