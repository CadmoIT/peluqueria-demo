// Contratos de la búsqueda de disponibilidad.
//
// La búsqueda recibe una sucursal, entre uno y cuatro servicios y, por cada
// uno, un profesional específico o "cualquiera". Devuelve opciones completas:
// cada opción es una secuencia de bloques consecutivos, sin tiempos muertos,
// con el profesional ya asignado a cada servicio.
import { z } from 'zod';

import { esquemaId } from './comunes';

/** Qué profesional se pide para un servicio. `null` es "cualquiera". */
export const esquemaServicioPedido = z.object({
  servicioId: esquemaId,
  profesionalId: esquemaId.nullable().default(null),
});
export type ServicioPedido = z.infer<typeof esquemaServicioPedido>;

export const esquemaBusquedaDisponibilidad = z.object({
  sucursalId: esquemaId,
  servicios: z.array(esquemaServicioPedido).min(1).max(4),
  /** Instante ISO desde el cual buscar. Nunca antes de ahora. */
  desde: z.string().datetime(),
  /** Instante ISO hasta el cual buscar. Lo acota el horizonte configurado. */
  hasta: z.string().datetime(),
});
export type BusquedaDisponibilidad = z.infer<typeof esquemaBusquedaDisponibilidad>;

/** Un servicio dentro de una opción, ya con su profesional y su horario. */
export const esquemaBloqueOpcion = z.object({
  orden: z.number().int().min(0),
  servicioId: esquemaId,
  servicioNombre: z.string(),
  profesionalId: esquemaId,
  profesionalNombre: z.string(),
  comienzaEn: z.string().datetime(),
  terminaEn: z.string().datetime(),
  duracionMinutos: z.number().int().positive(),
  precioCentavos: z.number().int().nonnegative(),
});
export type BloqueOpcion = z.infer<typeof esquemaBloqueOpcion>;

/** Una secuencia completa que el cliente puede elegir tal cual. */
export const esquemaOpcionDisponibilidad = z.object({
  comienzaEn: z.string().datetime(),
  terminaEn: z.string().datetime(),
  duracionTotalMinutos: z.number().int().positive(),
  precioTotalCentavos: z.number().int().nonnegative(),
  seniaTotalCentavos: z.number().int().nonnegative(),
  bloques: z.array(esquemaBloqueOpcion).min(1),
});
export type OpcionDisponibilidad = z.infer<typeof esquemaOpcionDisponibilidad>;

export const esquemaRespuestaDisponibilidad = z.object({
  opciones: z.array(esquemaOpcionDisponibilidad),
  /** Se corta el listado cuando hay más opciones de las que se devuelven. */
  hayMas: z.boolean(),
});
export type RespuestaDisponibilidad = z.infer<typeof esquemaRespuestaDisponibilidad>;
