// Rutas del sitio y estructura de la navegación principal.
// Centralizarlas evita que un cambio de URL deje enlaces rotos desperdigados.
//
// El sitio público es una sola página: nosotros, servicios, sucursales y
// contacto son secciones del inicio, no rutas propias. Sus viejas direcciones
// siguen funcionando —redirigen al ancla que corresponde, ver `next.config.ts`—
// así que un enlace guardado o compartido no se rompe.

/** Anclas de las secciones del inicio. El `id` va en el `<section>`. */
export const SECCIONES = {
  nosotros: 'nosotros',
  servicios: 'servicios',
  sucursales: 'sucursales',
  contacto: 'contacto',
} as const;

export const RUTAS = {
  inicio: '/',
  nosotros: `/#${SECCIONES.nosotros}`,
  servicios: `/#${SECCIONES.servicios}`,
  sucursales: `/#${SECCIONES.sucursales}`,
  contacto: `/#${SECCIONES.contacto}`,
  reservar: '/reservar',
  panel: '/panel',
} as const;

export interface EnlaceNavegacion {
  etiqueta: string;
  href: string;
}

/** Enlaces del encabezado, en orden de aparición. */
export const NAVEGACION_PRINCIPAL: EnlaceNavegacion[] = [
  { etiqueta: 'Nosotros', href: RUTAS.nosotros },
  { etiqueta: 'Servicios', href: RUTAS.servicios },
  { etiqueta: 'Sucursales', href: RUTAS.sucursales },
  { etiqueta: 'Contacto', href: RUTAS.contacto },
];
