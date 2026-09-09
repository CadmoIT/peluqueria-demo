// Mapa del sitio para buscadores.
//
// Sólo lista las páginas públicas: `/panel` y `/mi-reserva` quedan fuera a
// propósito, porque son privadas.
import type { MetadataRoute } from 'next';

import { RUTAS } from '@/utilidades/rutas';

const BASE = process.env.NEXT_PUBLIC_URL_PUBLICA ?? 'http://localhost:3000';

export default function sitemap(): MetadataRoute.Sitemap {
  const ahora = new Date();

  return [
    { url: `${BASE}${RUTAS.inicio}`, lastModified: ahora, priority: 1 },
    { url: `${BASE}${RUTAS.servicios}`, lastModified: ahora, priority: 0.9 },
    { url: `${BASE}${RUTAS.sucursales}`, lastModified: ahora, priority: 0.9 },
    { url: `${BASE}${RUTAS.reservar}`, lastModified: ahora, priority: 0.9 },
    { url: `${BASE}${RUTAS.nosotros}`, lastModified: ahora, priority: 0.6 },
    { url: `${BASE}${RUTAS.contacto}`, lastModified: ahora, priority: 0.6 },
  ];
}
