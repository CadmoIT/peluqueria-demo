// Página de servicios.
//
// Los precios y duraciones salen de la API, así que cambiarlos desde el panel
// se refleja acá sin tocar código. Si la API no responde, la página igual se
// muestra: un catálogo vacío es mejor que un error.
import type { Metadata } from 'next';
import Link from 'next/link';

import { Contenedor, EncabezadoSeccion, Seccion } from '@manly/interfaz';
import type { ServicioPublico, SucursalPublica } from '@manly/contratos';

import { Imagen } from '@/componentes/comunes/imagen';
import { consultarApi } from '@/servicios/api';
import { IMAGENES } from '@/utilidades/imagenes';
import { RUTAS } from '@/utilidades/rutas';
import { formatearDuracion, formatearPrecio } from '@/utilidades/formato';

export const metadata: Metadata = {
  title: 'Servicios',
  description: 'Cortes, barba y color en Manly. Mirá los precios y reservá tu turno online.',
  alternates: { canonical: '/servicios' },
};

// Se revalida cada media hora: los precios no cambian tan seguido como para
// pagar una consulta por visita.
export const revalidate = 1800;

interface ServicioConSucursales extends ServicioPublico {
  sucursales: string[];
}

async function cargarCatalogo(): Promise<ServicioConSucursales[]> {
  const sucursales = await consultarApi<SucursalPublica[]>('/sucursales');

  const porServicio = new Map<string, ServicioConSucursales>();

  for (const sucursal of sucursales) {
    const servicios = await consultarApi<ServicioPublico[]>(`/sucursales/${sucursal.id}/servicios`);

    for (const servicio of servicios) {
      const existente = porServicio.get(servicio.id);

      if (existente) {
        existente.sucursales.push(sucursal.nombre);
      } else {
        porServicio.set(servicio.id, { ...servicio, sucursales: [sucursal.nombre] });
      }
    }
  }

  return [...porServicio.values()];
}

export default async function PaginaServicios() {
  const servicios = await cargarCatalogo().catch(() => []);

  return (
    <Seccion>
      <Contenedor>
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_auto] lg:gap-16">
          <EncabezadoSeccion
            etiqueta="Qué hacemos"
            titulo="Servicios"
            bajada="Precio único, sin diferencia por medio de pago."
            nivel={1}
          />

          <div className="w-full max-w-xs justify-self-center lg:w-72">
            <Imagen
              imagen={IMAGENES.servicios.corte}
              sizes="(min-width: 1024px) 18rem, 100vw"
              className="rounded-tarjeta"
            />
          </div>
        </div>

        {servicios.length === 0 ? (
          <p className="text-menor text-grafito mt-bloque">
            No pudimos cargar el listado en este momento. Escribinos y te lo pasamos.
          </p>
        ) : (
          <ul className="mt-bloque border-borde border-t">
            {servicios.map((servicio) => (
              <li
                key={servicio.id}
                className="border-borde flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b py-5"
              >
                <div>
                  <h2 className="text-subtitulo">{servicio.nombre}</h2>
                  <p className="text-menor text-grafito">
                    {formatearDuracion(servicio.duracionMinutos)}
                    {servicio.seniaCentavos > 0
                      ? ` · seña de ${formatearPrecio(servicio.seniaCentavos)}`
                      : ''}
                  </p>
                  {servicio.descripcion ? (
                    <p className="text-menor text-grafito max-w-lectura mt-1">
                      {servicio.descripcion}
                    </p>
                  ) : null}
                </div>

                <p className="text-base">{formatearPrecio(servicio.precioCentavos)}</p>
              </li>
            ))}
          </ul>
        )}

        <Link
          href={RUTAS.reservar}
          className="versales bg-tinta text-lino rounded-manly mt-bloque text-menor duration-(--duracion-rapida) hover:bg-carbon inline-flex min-h-11 items-center px-8 py-4 transition-colors"
        >
          Reservar turno
        </Link>
      </Contenedor>
    </Seccion>
  );
}
