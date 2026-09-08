// Datos de contacto y ubicación de las sucursales para el sitio público.
//
// Provisorio: las direcciones, teléfonos y horarios reales todavía no fueron
// provistos. A partir de la Fase 3 estos datos salen de la base y se administran
// desde el panel; hasta entonces el sitio los toma de acá.

export interface SucursalSitio {
  id: string;
  nombre: string;
  barrio: string;
  direccion: string;
  /** Número en formato internacional, sin espacios ni signos, para wa.me. */
  whatsapp: string;
}

export const SUCURSALES: SucursalSitio[] = [
  {
    id: 'las-canitas',
    nombre: 'Las Cañitas',
    barrio: 'Las Cañitas, CABA',
    direccion: 'Pendiente de confirmar',
    whatsapp: '',
  },
  {
    id: 'colegiales',
    nombre: 'Virrey Avilés',
    barrio: 'Colegiales, CABA',
    direccion: 'Pendiente de confirmar',
    whatsapp: '',
  },
  {
    id: 'belgrano',
    nombre: 'Aguilar',
    barrio: 'Belgrano, CABA',
    direccion: 'Pendiente de confirmar',
    whatsapp: '',
  },
];
