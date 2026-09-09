// Reglas para los rastreadores.
//
// Se bloquean el panel y los enlaces privados de gestión: un token indexado
// dejaría la reserva de alguien al alcance de cualquiera.
import type { MetadataRoute } from 'next';

const BASE = process.env.NEXT_PUBLIC_URL_PUBLICA ?? 'http://localhost:3000';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/panel', '/mi-reserva'],
    },
    sitemap: `${BASE}/sitemap.xml`,
  };
}
