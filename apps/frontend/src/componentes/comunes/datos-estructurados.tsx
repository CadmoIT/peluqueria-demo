// Datos estructurados de negocio local, para los buscadores.
//
// Es lo que hace que Manly aparezca con dirección, horario y enlace de reserva
// en los resultados y en el mapa, en vez de como un enlace pelado.
import type { SucursalPublica } from '@manly/contratos';

const BASE = process.env.NEXT_PUBLIC_URL_PUBLICA ?? 'http://localhost:3000';

interface Propiedades {
  sucursales: SucursalPublica[];
}

export function DatosEstructurados({ sucursales }: Propiedades) {
  const datos = {
    '@context': 'https://schema.org',
    '@type': 'HairSalon',
    name: 'Manly Barber Studio',
    description: 'Estudio de barbería para hombres en Buenos Aires, con línea propia de productos.',
    url: BASE,
    areaServed: { '@type': 'City', name: 'Buenos Aires' },
    potentialAction: {
      '@type': 'ReserveAction',
      target: `${BASE}/reservar`,
      name: 'Reservar turno',
    },
    location: sucursales.map((sucursal) => ({
      '@type': 'HairSalon',
      name: `Manly Barber Studio ${sucursal.nombre}`,
      address: {
        '@type': 'PostalAddress',
        streetAddress: sucursal.direccion,
        addressLocality: sucursal.barrio,
        addressCountry: 'AR',
      },
      ...(sucursal.telefono ? { telephone: sucursal.telefono } : {}),
    })),
  };

  return (
    <script
      type="application/ld+json"
      // El contenido lo arma el servidor a partir de datos propios, no de
      // entrada de usuarios.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(datos) }}
    />
  );
}
