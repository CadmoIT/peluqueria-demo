// Rutas del sitio y estructura de la navegación principal.
// Centralizarlas evita que un cambio de URL deje enlaces rotos desperdigados.

export const RUTAS = {
  inicio: '/',
  nosotros: '/nosotros',
  servicios: '/servicios',
  sucursales: '/sucursales',
  contacto: '/contacto',
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
