// Página de inicio: portada, propuesta de valor, sucursales y llamada a reservar.
// El contenido definitivo (textos y fotografías de Manly) llega en la Fase 5;
// lo que queda armado acá es la estructura y el sistema visual.
import Link from 'next/link';

import { Contenedor, EncabezadoSeccion, Seccion } from '@manly/interfaz';

import { Imagen } from '@/componentes/comunes/imagen';
import { IMAGENES } from '@/utilidades/imagenes';
import { RUTAS } from '@/utilidades/rutas';
import { SUCURSALES } from '@/utilidades/sucursales';

export default function PaginaInicio() {
  return (
    <>
      <section className="relative isolate">
        <div className="absolute inset-0 -z-10">
          <Imagen imagen={IMAGENES.inicio.portada} prioritaria sizes="100vw" />
          <div className="bg-tinta/55 absolute inset-0" />
        </div>

        <Contenedor className="text-lino py-seccion flex min-h-[32rem] flex-col justify-end sm:min-h-[38rem]">
          <p className="versales text-nota mb-4 opacity-80">Buenos Aires</p>
          <h1 className="text-portada max-w-[14ch]">Peluquería para hombres</h1>
          <p className="text-guia mt-5 max-w-[46ch] opacity-90">
            Tres sucursales, turnos online y el mismo trabajo de siempre.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href={RUTAS.reservar}
              className="versales bg-lino text-tinta rounded-manly text-menor duration-(--duracion-rapida) inline-flex min-h-11 items-center justify-center px-8 py-4 transition-colors hover:bg-white"
            >
              Reservar turno
            </Link>
            <Link
              href={RUTAS.servicios}
              className="versales border-lino text-lino rounded-manly hover:bg-lino hover:text-tinta text-menor duration-(--duracion-rapida) inline-flex min-h-11 items-center justify-center border px-8 py-4 transition-colors"
            >
              Ver servicios
            </Link>
          </div>
        </Contenedor>
      </section>

      <Seccion>
        <Contenedor>
          <EncabezadoSeccion
            etiqueta="La experiencia"
            titulo="Un lugar donde volver"
            bajada="Pendiente: texto institucional de Manly (Fase 5)."
          />
        </Contenedor>
      </Seccion>

      <Seccion fondo="niebla">
        <Contenedor>
          <EncabezadoSeccion etiqueta="Dónde estamos" titulo="Nuestras sucursales" />

          <ul className="mt-bloque grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {SUCURSALES.map((sucursal) => (
              <li key={sucursal.id} className="bg-papel border-borde rounded-tarjeta border">
                <div className="aspect-[4/3] overflow-hidden">
                  <Imagen
                    imagen={
                      IMAGENES.sucursales[
                        sucursal.id === 'las-canitas'
                          ? 'lasCanitas'
                          : sucursal.id === 'colegiales'
                            ? 'colegiales'
                            : 'belgrano'
                      ]
                    }
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  />
                </div>
                <div className="p-5">
                  <h3 className="text-subtitulo">{sucursal.nombre}</h3>
                  <p className="text-menor text-grafito mt-1">{sucursal.barrio}</p>
                </div>
              </li>
            ))}
          </ul>
        </Contenedor>
      </Seccion>

      <Seccion fondo="invertido">
        <Contenedor className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <EncabezadoSeccion titulo="Reservá en un minuto" className="max-w-[20ch]" />
          <Link
            href={RUTAS.reservar}
            className="versales border-lino rounded-manly hover:bg-lino hover:text-tinta text-menor duration-(--duracion-rapida) inline-flex min-h-11 shrink-0 items-center justify-center border px-8 py-4 transition-colors"
          >
            Reservar turno
          </Link>
        </Contenedor>
      </Seccion>
    </>
  );
}
