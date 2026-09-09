// Página de sucursales.
//
// Cada tarjeta enlaza a la reserva con la sucursal ya preseleccionada, como
// pide el plan: quien entra desde acá no debería tener que elegirla de nuevo.
import type { Metadata } from 'next';
import Link from 'next/link';

import { Contenedor, EncabezadoSeccion, Seccion } from '@manly/interfaz';
import type { SucursalPublica } from '@manly/contratos';

import { DatosEstructurados } from '@/componentes/comunes/datos-estructurados';
import { Imagen } from '@/componentes/comunes/imagen';
import { consultarApi } from '@/servicios/api';
import { IMAGENES, type ImagenCatalogo } from '@/utilidades/imagenes';
import { RUTAS } from '@/utilidades/rutas';

export const metadata: Metadata = {
  title: 'Sucursales',
  description: 'Manly tiene tres sucursales en Buenos Aires: Las Cañitas, Colegiales y Belgrano.',
  alternates: { canonical: '/sucursales' },
};

export const revalidate = 1800;

/** Fotografía de cada sucursal, mientras el catálogo siga con marcadores. */
function fotoDe(nombre: string): ImagenCatalogo {
  if (nombre.includes('Cañitas')) return IMAGENES.sucursales.lasCanitas;
  if (nombre.includes('Avilés')) return IMAGENES.sucursales.colegiales;

  return IMAGENES.sucursales.belgrano;
}

export default async function PaginaSucursales() {
  const sucursales = await consultarApi<SucursalPublica[]>('/sucursales').catch(() => []);

  return (
    <Seccion>
      <Contenedor>
        <DatosEstructurados sucursales={sucursales} />

        <EncabezadoSeccion
          etiqueta="Dónde estamos"
          titulo="Sucursales"
          bajada="Tres locales en Buenos Aires. Elegí el que te queda más cómodo."
          nivel={1}
        />

        {sucursales.length === 0 ? (
          <p className="text-menor text-grafito mt-bloque">
            No pudimos cargar las sucursales en este momento.
          </p>
        ) : (
          <ul className="mt-bloque grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {sucursales.map((sucursal) => (
              <li
                key={sucursal.id}
                className="bg-papel border-borde rounded-tarjeta flex flex-col border"
              >
                <div className="aspect-[4/3] overflow-hidden">
                  <Imagen
                    imagen={fotoDe(sucursal.nombre)}
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  />
                </div>

                <div className="flex flex-1 flex-col p-5">
                  <h2 className="text-subtitulo">{sucursal.nombre}</h2>
                  <p className="text-menor text-grafito mt-1">{sucursal.barrio}</p>
                  <p className="text-menor text-grafito">{sucursal.direccion}</p>

                  <Link
                    href={`${RUTAS.reservar}?sucursal=${sucursal.id}`}
                    className="versales border-tinta rounded-manly hover:bg-tinta hover:text-lino text-menor duration-(--duracion-rapida) mt-5 inline-flex min-h-11 items-center justify-center border px-5 transition-colors"
                  >
                    Reservar acá
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Contenedor>
    </Seccion>
  );
}
