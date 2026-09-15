// Contratos del catálogo público: sucursales, servicios y profesionales.
//
// Es lo que la web necesita para armar el flujo de reserva. Sólo se expone lo
// que el cliente tiene que ver: nada de configuración interna ni de precios de
// costo.
import { z } from 'zod';

import { esquemaId, esquemaModalidadSenia } from './comunes';

export const esquemaSucursalPublica = z.object({
  id: esquemaId,
  nombre: z.string(),
  barrio: z.string(),
  direccion: z.string(),
  telefono: z.string().nullable(),
  whatsapp: z.string().nullable(),
  urlMapa: z.string().nullable(),
});
export type SucursalPublica = z.infer<typeof esquemaSucursalPublica>;

export const esquemaServicioPublico = z.object({
  id: esquemaId,
  nombre: z.string(),
  descripcion: z.string().nullable(),
  categoria: z.string().nullable(),
  duracionMinutos: z.number().int().positive(),
  precioCentavos: z.number().int().nonnegative(),
  modalidadSenia: esquemaModalidadSenia,
  /** Cuánto se cobra por adelantado. Ya resuelto: la web no recalcula nada. */
  seniaCentavos: z.number().int().nonnegative(),
});
export type ServicioPublico = z.infer<typeof esquemaServicioPublico>;

export const esquemaProfesionalPublico = z.object({
  id: esquemaId,
  nombre: z.string(),
});
export type ProfesionalPublico = z.infer<typeof esquemaProfesionalPublico>;

/**
 * Un producto de la línea propia, como lo ve el sitio.
 *
 * No lleva stock ni nada de compra: la vitrina muestra qué hay y cuánto sale;
 * el producto se lleva del local.
 */
export const esquemaProductoPublico = z.object({
  id: esquemaId,
  nombre: z.string(),
  /** La línea en versales sobre el nombre. */
  detalle: z.string().nullable(),
  /** En null no se muestra precio: mejor eso que mostrar uno viejo. */
  precioCentavos: z.number().int().nonnegative().nullable(),
  /** Clave de la fotografía en el catálogo de imágenes de la web. */
  imagenClave: z.string(),
});
export type ProductoPublico = z.infer<typeof esquemaProductoPublico>;
