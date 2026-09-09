// Página de contacto.
//
// Los datos salen de la API, así que cargar un teléfono o un WhatsApp desde el
// panel los publica acá sin tocar código. Los campos que todavía están vacíos
// simplemente no se muestran: es mejor que un enlace que no lleva a ningún lado.
import type { Metadata } from 'next';
import Link from 'next/link';

import { Contenedor, EncabezadoSeccion, Seccion } from '@manly/interfaz';
import type { SucursalPublica } from '@manly/contratos';

import { consultarApi } from '@/servicios/api';
import { RUTAS } from '@/utilidades/rutas';

export const metadata: Metadata = {
  title: 'Contacto',
  description: 'Cómo llegar y cómo escribirnos. Manly Barber Studio, Buenos Aires.',
  alternates: { canonical: '/contacto' },
};

export const revalidate = 1800;

export default async function PaginaContacto() {
  const sucursales = await consultarApi<SucursalPublica[]>('/sucursales').catch(() => []);

  return (
    <Seccion>
      <Contenedor>
        <EncabezadoSeccion
          etiqueta="Escribinos"
          titulo="Contacto"
          bajada="Para reservar, lo más rápido es hacerlo online. Para cualquier otra cosa, estamos acá."
          nivel={1}
        />

        {sucursales.length === 0 ? (
          <p className="text-menor text-grafito mt-bloque">
            No pudimos cargar los datos de contacto en este momento.
          </p>
        ) : (
          <ul className="mt-bloque grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {sucursales.map((sucursal) => (
              <li key={sucursal.id} className="border-borde rounded-tarjeta border p-5">
                <h2 className="text-subtitulo">{sucursal.nombre}</h2>
                <p className="text-menor text-grafito mt-1">{sucursal.barrio}</p>
                <p className="text-menor text-grafito">{sucursal.direccion}</p>

                <div className="mt-4 flex flex-col gap-2">
                  {sucursal.whatsapp ? (
                    <a
                      href={`https://wa.me/${sucursal.whatsapp}`}
                      rel="noopener noreferrer"
                      target="_blank"
                      className="text-menor inline-flex min-h-11 items-center underline-offset-4 hover:underline"
                    >
                      WhatsApp
                    </a>
                  ) : null}

                  {sucursal.telefono ? (
                    <a
                      href={`tel:${sucursal.telefono}`}
                      className="text-menor inline-flex min-h-11 items-center underline-offset-4 hover:underline"
                    >
                      {sucursal.telefono}
                    </a>
                  ) : null}

                  {sucursal.urlMapa ? (
                    <a
                      href={sucursal.urlMapa}
                      rel="noopener noreferrer"
                      target="_blank"
                      className="text-menor inline-flex min-h-11 items-center underline-offset-4 hover:underline"
                    >
                      Cómo llegar
                    </a>
                  ) : null}
                </div>

                <Link
                  href={`${RUTAS.reservar}?sucursal=${sucursal.id}`}
                  className="versales border-tinta rounded-manly hover:bg-tinta hover:text-lino text-menor duration-(--duracion-rapida) mt-5 inline-flex min-h-11 items-center justify-center border px-5 transition-colors"
                >
                  Reservar acá
                </Link>
              </li>
            ))}
          </ul>
        )}

        <p className="text-nota text-grafito mt-bloque">
          Los teléfonos y enlaces de mapa se cargan desde el panel. Los que todavía no están
          cargados no se muestran.
        </p>
      </Contenedor>
    </Seccion>
  );
}
