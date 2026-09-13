// Página de inicio: el sitio público entero.
//
// Nosotros, servicios, sucursales y contacto son secciones de acá y no páginas
// aparte. Quien entra baja una vez y ya vio todo; el menú lleva a la sección y
// no a otra carga. Las direcciones viejas siguen vivas y redirigen al ancla
// correspondiente, así que ningún enlace compartido se rompe.
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
import type { ServicioPublico, SucursalPublica } from '@manly/contratos';

import { Imagen } from '@/componentes/comunes/imagen';
import { DatosEstructurados } from '@/componentes/comunes/datos-estructurados';
import { consultarApi } from '@/servicios/api';
import { formatearDuracion, formatearPrecio } from '@/utilidades/formato';
import { IMAGENES } from '@/utilidades/imagenes';
import { RUTAS, SECCIONES } from '@/utilidades/rutas';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

// Se revalida cada media hora: ni los precios ni las sucursales cambian tan
// seguido como para pagar una consulta por visita.
export const revalidate = 1800;

interface ServicioConSucursales extends ServicioPublico {
  sucursales: string[];
}

/**
 * Catálogo unificado: un servicio aparece una vez, con las sucursales donde se
 * hace. Si se listara por sucursal, el mismo corte saldría tres veces.
 */
async function cargarCatalogo(sucursales: SucursalPublica[]): Promise<ServicioConSucursales[]> {
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

export default async function PaginaInicio() {
  // Si la API no responde, la página se muestra igual con lo que haya: un
  // catálogo vacío es mejor que un error en la cara.
  const sucursales = await consultarApi<SucursalPublica[]>('/sucursales').catch(() => []);
  const servicios = await cargarCatalogo(sucursales).catch(() => []);

  return (
    <>
      <DatosEstructurados sucursales={sucursales} />

      {/* ── Portada ──────────────────────────────────────────────────────── */}
      <section
        data-portada-oscura
        className="bg-tinta text-lino relative isolate overflow-hidden"
      >
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

      {/* ── Nosotros ─────────────────────────────────────────────────────── */}
      <Seccion id={SECCIONES.nosotros} className="revelar">
        <Contenedor className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <EncabezadoSeccion etiqueta="Quiénes somos" titulo="El oficio" />

            <div className="text-guia text-grafito max-w-lectura mt-5 flex flex-col gap-4">
              <p>
                Trabajamos el corte como un oficio: se mide, se perfila y se termina a mano. No hay
                dos cabezas iguales, y el corte se piensa para cómo te vas a peinar todos los días,
                no para cómo queda el día que salís del local.
              </p>
              <p>
                <strong className="text-tinta">Pendiente:</strong> reemplazar por el texto
                institucional definitivo de Manly.
              </p>
            </div>
          </div>

          <Imagen
            imagen={IMAGENES.inicio.experiencia}
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="rounded-tarjeta aspect-[3/4] object-cover"
          />
        </Contenedor>
      </Seccion>

      {/* ── La línea propia ──────────────────────────────────────────────── */}
      <Seccion fondo="niebla" className="revelar">
        <Contenedor>
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <Imagen
              imagen={IMAGENES.marca.lineaProductos}
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="rounded-tarjeta aspect-[3/4] object-cover"
            />

            <div>
              <EncabezadoSeccion etiqueta="Línea propia" titulo="Productos Manly" />

              <div className="text-guia text-grafito max-w-lectura mt-5 flex flex-col gap-4">
                <p>
                  Desarrollamos nuestros propios productos porque no encontrábamos lo que
                  buscábamos: fijación que aguante sin endurecer, acabado mate y base al agua para
                  que salga con una lavada.
                </p>
                <p>Son los mismos que usamos en el sillón y se consiguen en cualquier sucursal.</p>
              </div>
            </div>
          </div>

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

      {/* ── Servicios ────────────────────────────────────────────────────── */}
      <Seccion id={SECCIONES.servicios} className="revelar">
        <Contenedor>
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_auto] lg:gap-16">
            <EncabezadoSeccion
              etiqueta="Qué hacemos"
              titulo="Servicios"
              bajada="Precio único, sin diferencia por medio de pago."
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
                    <h3 className="text-subtitulo">{servicio.nombre}</h3>
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

      {/* ── Sucursales ───────────────────────────────────────────────────── */}
      <Seccion fondo="niebla" id={SECCIONES.sucursales} className="revelar">
        <Contenedor>
          <EncabezadoSeccion
            etiqueta="Dónde estamos"
            titulo="Nuestras sucursales"
            bajada="Tres locales en Buenos Aires. Elegí el que te queda más cómodo."
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
                  className="bg-papel border-borde rounded-tarjeta flex flex-col border p-5"
                >
                  <h3 className="text-subtitulo">{sucursal.nombre}</h3>
                  <p className="text-menor text-grafito mt-1">{sucursal.barrio}</p>
                  <p className="text-menor text-grafito">{sucursal.direccion}</p>

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
        </Contenedor>
      </Seccion>

      {/* ── Contacto ─────────────────────────────────────────────────────── */}
      <Seccion id={SECCIONES.contacto} className="revelar">
        <Contenedor>
          <EncabezadoSeccion
            etiqueta="Escribinos"
            titulo="Contacto"
            bajada="Para reservar, lo más rápido es hacerlo online. Para cualquier otra cosa, estamos acá."
          />

          {sucursales.length === 0 ? (
            <p className="text-menor text-grafito mt-bloque">
              No pudimos cargar los datos de contacto en este momento.
            </p>
          ) : (
            <ul className="mt-bloque grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {sucursales.map((sucursal) => (
                <li key={sucursal.id} className="border-borde rounded-tarjeta border p-5">
                  <h3 className="text-subtitulo">{sucursal.nombre}</h3>
                  <p className="text-menor text-grafito mt-1">{sucursal.barrio}</p>

                  {/* Los campos vacíos no se dibujan: es mejor que un enlace
                      que no lleva a ningún lado. */}
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

      {/* ── Cierre ───────────────────────────────────────────────────────── */}
      <Seccion fondo="invertido" className="revelar">
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
