// Mapa del sitio para buscadores.
//
// Sólo lista direcciones que existen. El sitio público es una sola página, así
// que nosotros, servicios, sucursales y contacto no van acá: son anclas, no
// URLs, y sus viejas direcciones ahora redirigen. Listar una redirección es
// pedirle al buscador que indexe algo que no existe.
//
// `/panel` y `/mi-reserva` quedan fuera a propósito, porque son privadas.
import type { MetadataRoute } from 'next';

import { RUTAS } from '@/utilidades/rutas';

const BASE = process.env.NEXT_PUBLIC_URL_PUBLICA ?? 'http://localhost:3000';

export default function sitemap(): MetadataRoute.Sitemap {
  const ahora = new Date();

  return [
    { url: `${BASE}${RUTAS.inicio}`, lastModified: ahora, priority: 1 },
    { url: `${BASE}${RUTAS.reservar}`, lastModified: ahora, priority: 0.9 },
  ];
}
