// Página de inicio.
//
// La portada es una foto a sangre con el texto encima. Antes era una
// composición partida, y no por gusto: el único material que había era
// vertical, y estirarlo a formato apaisado lo recortaba justo donde estaba el
// sujeto. La fotografía del salón es apaisada y levanta esa restricción.
//
// Lo que hace legible al titular es el velo, no la fotografía. Sin él el texto
// cae sobre los cromados de los sillones y se pierde.
import type { Metadata } from 'next';
import Link from 'next/link';

import { Contenedor, EncabezadoSeccion, Seccion } from '@manly/interfaz';
import type { SucursalPublica } from '@manly/contratos';

import { Imagen } from '@/componentes/comunes/imagen';
import { DatosEstructurados } from '@/componentes/comunes/datos-estructurados';
import { consultarApi } from '@/servicios/api';
import { IMAGENES } from '@/utilidades/imagenes';
import { RUTAS } from '@/utilidades/rutas';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

export const revalidate = 1800;

export default async function PaginaInicio() {
  const sucursales = await consultarApi<SucursalPublica[]>('/sucursales').catch(() => []);

  return (
    <>
      <DatosEstructurados sucursales={sucursales} />

      {/* ── Portada ──────────────────────────────────────────────────────── */}
      <section className="bg-tinta text-lino relative isolate overflow-hidden">
        <Imagen
          imagen={IMAGENES.inicio.portada}
          prioritaria
          sizes="100vw"
          className="absolute inset-0 -z-20"
        />

        {/*
          El velo corre en vertical en el teléfono, donde el texto queda sobre
          la foto, y en horizontal de tablet para arriba, que es cuando hay
          sitio para dejar el texto de un lado y los sillones del otro.
        */}
        <div
          aria-hidden
          className="from-tinta via-tinta/85 to-tinta/35 sm:via-tinta/65 sm:via-45% sm:to-transparent absolute inset-0 -z-10 bg-gradient-to-t sm:bg-gradient-to-r"
        />

        <Contenedor className="py-seccion relative flex min-h-[clamp(26rem,58vh,36rem)] items-center">
          <div className="max-w-[34rem]">
            <p className="versales text-nota mb-5 opacity-80">Buenos Aires</p>

            <h1 className="text-portada max-w-[13ch]">Peluquería para hombres</h1>

            <p className="text-guia mt-6 max-w-[42ch] opacity-85">
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
          </div>
        </Contenedor>
      </section>

      {/* ── La experiencia ───────────────────────────────────────────────── */}
      <Seccion>
        <Contenedor className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="order-2 lg:order-1">
            <EncabezadoSeccion
              etiqueta="La experiencia"
              titulo="Un lugar donde volver"
              bajada="Cortes de precisión, barba y color, con productos propios formulados para que el peinado dure hasta el día siguiente."
            />

            <Link
              href={RUTAS.nosotros}
              className="versales border-tinta rounded-manly hover:bg-tinta hover:text-lino text-menor duration-(--duracion-rapida) mt-8 inline-flex min-h-11 items-center border px-6 transition-colors"
            >
              Conocenos
            </Link>
          </div>

          <div className="order-1 lg:order-2">
            <Imagen
              imagen={IMAGENES.inicio.experiencia}
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="rounded-tarjeta aspect-[3/4] object-cover"
            />
          </div>
        </Contenedor>
      </Seccion>

      {/* ── Productos propios ────────────────────────────────────────────── */}
      <Seccion fondo="niebla">
        <Contenedor>
          <EncabezadoSeccion
            etiqueta="Línea propia"
            titulo="Productos Manly"
            bajada="Los mismos que usamos en el sillón. Se consiguen en cualquiera de las sucursales."
          />

          <ul className="mt-bloque grid gap-6 sm:grid-cols-3">
            {[
              IMAGENES.marca.pomadaMate,
              IMAGENES.marca.pomadaTransparente,
              IMAGENES.marca.polvoTexturizador,
            ].map((producto) => (
              <li key={producto.ruta} className="bg-papel rounded-tarjeta overflow-hidden">
                <Imagen
                  imagen={producto}
                  sizes="(min-width: 640px) 33vw, 100vw"
                  className="aspect-[4/5] object-cover"
                />
              </li>
            ))}
          </ul>
        </Contenedor>
      </Seccion>

      {/* ── Sucursales ───────────────────────────────────────────────────── */}
      <Seccion>
        <Contenedor>
          <EncabezadoSeccion etiqueta="Dónde estamos" titulo="Nuestras sucursales" />

          <ul className="mt-bloque grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {sucursales.map((sucursal) => (
              <li key={sucursal.id} className="border-borde rounded-tarjeta border p-5">
                <h3 className="text-subtitulo">{sucursal.nombre}</h3>
                <p className="text-menor text-grafito mt-1">{sucursal.barrio}</p>

                <Link
                  href={`${RUTAS.reservar}?sucursal=${sucursal.id}`}
                  className="versales text-nota mt-4 inline-flex min-h-11 items-center underline-offset-4 hover:underline"
                >
                  Reservar acá
                </Link>
              </li>
            ))}
          </ul>
        </Contenedor>
      </Seccion>

      {/* ── Cierre ───────────────────────────────────────────────────────── */}
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
