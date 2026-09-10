// Contratos del flujo de reserva y de la gestión sin cuenta.
//
// El flujo tiene dos pasos a propósito: primero se retiene el horario elegido y
// recién después se piden los datos del cliente. Así nadie completa un
// formulario para enterarse al final de que el turno ya no está.
import { z } from 'zod';

import { esquemaCanalContacto, esquemaEstadoReserva, esquemaId } from './comunes';

// ── Retener ──────────────────────────────────────────────────────────────────

/** Un bloque de la opción elegida, tal como lo devolvió la búsqueda. */
export const esquemaBloqueElegido = z.object({
  servicioId: esquemaId,
  profesionalId: esquemaId,
  orden: z.number().int().min(0),
  comienzaEn: z.string().datetime(),
  terminaEn: z.string().datetime(),
});
export type BloqueElegido = z.infer<typeof esquemaBloqueElegido>;

export const esquemaPedidoRetencion = z.object({
  sucursalId: esquemaId,
  bloques: z.array(esquemaBloqueElegido).min(1).max(4),
});
export type PedidoRetencion = z.infer<typeof esquemaPedidoRetencion>;

export const esquemaRetencion = z.object({
  reservaId: esquemaId,
  /**
   * Token en claro con el que se completa y después se gestiona la reserva.
   * Sólo se devuelve acá: en la base queda únicamente su hash.
   */
  token: z.string(),
  comienzaEn: z.string().datetime(),
  terminaEn: z.string().datetime(),
  /** Hasta cuándo se mantiene el horario si no se completa la reserva. */
  retencionExpiraEn: z.string().datetime(),
  precioTotalCentavos: z.number().int().nonnegative(),
  seniaTotalCentavos: z.number().int().nonnegative(),
});
export type Retencion = z.infer<typeof esquemaRetencion>;

// ── Confirmar ────────────────────────────────────────────────────────────────

/**
 * Trata un campo vacío como ausente.
 *
 * Un formulario manda `''` en los campos que la persona no completó, y sin esto
 * el respaldo opcional fallaría la validación de formato por estar en blanco.
 */
function vacioComoAusente<T extends z.ZodTypeAny>(esquema: T) {
  return z.preprocess(
    (valor) => (typeof valor === 'string' && valor.trim() === '' ? undefined : valor),
    esquema.optional(),
  );
}

/**
 * Datos del cliente.
 *
 * Se elige **un** canal, que es por donde se avisa. El otro dato es opcional y
 * sirve de respaldo: si el canal elegido falla de forma definitiva —un número
 * que no existe, un correo que rebota— se intenta por el otro antes de alertar
 * al local. Sin ese segundo dato no hay respaldo posible y la reserva queda
 * incomunicada.
 */
export const esquemaDatosCliente = z
  .object({
    nombre: z.string().trim().min(2, 'Decinos cómo te llamás.').max(80),
    canalContacto: esquemaCanalContacto,
    /** Número de WhatsApp en formato internacional, sin espacios ni signos. */
    whatsapp: vacioComoAusente(
      z
        .string()
        .trim()
        .regex(/^\d{8,15}$/, 'El número tiene que ser sólo dígitos, con código de país.'),
    ),
    email: vacioComoAusente(z.string().trim().email('Revisá la dirección de correo.')),
    notas: z.string().trim().max(500).optional(),
    aceptaCondiciones: z.literal(true, {
      errorMap: () => ({ message: 'Hay que aceptar las condiciones para reservar.' }),
    }),
  })
  .refine(
    (datos) =>
      datos.canalContacto === 'whatsapp' ? Boolean(datos.whatsapp) : Boolean(datos.email),
    {
      message: 'Falta el dato del canal que elegiste.',
      path: ['canalContacto'],
    },
  );
export type DatosCliente = z.infer<typeof esquemaDatosCliente>;

export const esquemaPedidoConfirmacion = z.object({
  token: z.string().min(10),
  cliente: esquemaDatosCliente,
});
export type PedidoConfirmacion = z.infer<typeof esquemaPedidoConfirmacion>;

// ── Consultar y gestionar ────────────────────────────────────────────────────

export const esquemaBloqueReserva = z.object({
  orden: z.number().int().min(0),
  servicioNombre: z.string(),
  profesionalNombre: z.string(),
  comienzaEn: z.string().datetime(),
  terminaEn: z.string().datetime(),
  duracionMinutos: z.number().int().positive(),
  precioCentavos: z.number().int().nonnegative(),
});
export type BloqueReserva = z.infer<typeof esquemaBloqueReserva>;

export const esquemaReservaPublica = z.object({
  id: esquemaId,
  estado: esquemaEstadoReserva,
  sucursal: z.object({
    nombre: z.string(),
    barrio: z.string(),
    direccion: z.string(),
  }),
  clienteNombre: z.string().nullable(),
  comienzaEn: z.string().datetime(),
  terminaEn: z.string().datetime(),
  precioTotalCentavos: z.number().int().nonnegative(),
  seniaTotalCentavos: z.number().int().nonnegative(),
  bloques: z.array(esquemaBloqueReserva),

  /** Si todavía se puede cancelar o reprogramar sin pedir autorización. */
  puedeGestionarse: z.boolean(),
  /** Horas de anticipación que rigen para esta reserva. */
  horasMinimasCancelacion: z.number().int().nonnegative(),
  /** Momento a partir del cual el cambio pasa a requerir aprobación. */
  limiteCambioAutomatico: z.string().datetime().nullable(),
});
export type ReservaPublica = z.infer<typeof esquemaReservaPublica>;

export const esquemaPedidoCancelacion = z.object({
  motivo: z.string().trim().max(300).optional(),
});
export type PedidoCancelacion = z.infer<typeof esquemaPedidoCancelacion>;

/** Qué pasó al pedir la cancelación. */
export const esquemaResultadoGestion = z.object({
  /** `cancelada` o `reprogramada` si fue automático; `solicitada` si va a gerencia. */
  resultado: z.enum(['cancelada', 'reprogramada', 'solicitada']),
  mensaje: z.string(),
});
export type ResultadoGestion = z.infer<typeof esquemaResultadoGestion>;

export const esquemaPedidoReprogramacion = z.object({
  sucursalId: esquemaId,
  bloques: z.array(esquemaBloqueElegido).min(1).max(4),
  motivo: z.string().trim().max(300).optional(),
});
export type PedidoReprogramacion = z.infer<typeof esquemaPedidoReprogramacion>;
