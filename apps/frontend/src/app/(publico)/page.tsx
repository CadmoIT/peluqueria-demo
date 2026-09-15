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
//
// ── Por qué la página se ve así ──────────────────────────────────────────────
// El reclamo era aire: entre un párrafo y el siguiente había demasiado blanco y
// el sitio se leía a medio hacer. Se corrigió por tres lados a la vez, porque
// bajar sólo los márgenes hubiera dejado el mismo contenido flaco, más junto:
//
//   1. El ritmo vertical del sistema bajó (ver `--spacing-seccion`).
//   2. Las secciones que decían lo mismo se juntaron. Los datos de contacto
//      vivían en una sección propia que repetía las tres sucursales una a una;
//      ahora están dentro de la tarjeta de cada sucursal, que es donde alguien
//      los busca, y `#contacto` es el cierre.
//   3. Donde había una columna con tres líneas y medio metro de blanco al lado
//      ahora hay algo: la cinta de datos bajo la portada, las cifras de
//      «Nosotros», la cita, y las grillas a hueso —sin separación entre celdas,
//      divididas por un filete— de servicios y sucursales.
//
// Los textos son provisorios: están escritos para que la página se pueda ver y
// juzgar, no para publicarse. Reemplazar por los definitivos de Manly antes de
// salir a producción.
import type { Metadata } from 'next';
import Link from 'next/link';

import { clasesBoton, cn, Contenedor, EncabezadoSeccion, Seccion } from '@manly/interfaz';
import type { ServicioPublico, SucursalPublica } from '@manly/contratos';

import { Imagen } from '@/componentes/comunes/imagen';
import { DatosEstructurados } from '@/componentes/comunes/datos-estructurados';
import { Cinta } from '@/componentes/inicio/cinta';
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
 * La línea de productos.
 *
 * Va escrita acá y no en la API porque no se vende online: es una vitrina, no
 * un catálogo. Los nombres son los descriptivos en castellano, los mismos del
 * texto alternativo de cada foto; si Manly prefiere los comerciales de la lata,
 * se cambian en este arreglo y en `imagenes.ts`.
 */
const PRODUCTOS = [
  {
    imagen: IMAGENES.marca.pomadaMate,
    nombre: 'Pomada mate',
    detalle: 'Fijación fuerte · base agua',
  },
  {
    imagen: IMAGENES.marca.pomadaTransparente,
    nombre: 'Pomada transparente',
    detalle: 'Estructura · base agua',
  },
  {
    imagen: IMAGENES.marca.polvoTexturizador,
    nombre: 'Polvo texturizador',
    detalle: 'Volumen · acabado seco',
  },
];

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

  // Las cifras salen de los datos, no de una promesa de folleto: si mañana
  // abren una sucursal, el número cambia solo. Las que no se pueden contar
  // porque la API no respondió no se muestran, que es mejor que mostrar un
  // cero.
  const cifras: { valor: string; etiqueta: string }[] = [];

  if (sucursales.length > 0) {
    cifras.push({ valor: String(sucursales.length), etiqueta: 'Sucursales' });
  }

  if (servicios.length > 0) {
    cifras.push({ valor: String(servicios.length), etiqueta: 'Servicios' });
  }

  cifras.push({ valor: '24 h', etiqueta: 'Reservas online' });

  // Mientras no haya un WhatsApp cargado, el cierre no tiene segunda columna:
  // partirlo en dos igual dejaría media franja vacía, que es justo lo que se
  // vino a corregir.
  const conWhatsapp = sucursales.filter((sucursal) => sucursal.whatsapp);

  const piezasCinta = [
    'Peluquería para hombres',
    sucursales.length > 0
      ? `${String(sucursales.length)} sucursales en Buenos Aires`
      : 'Buenos Aires',
    'Turnos online',
    'Línea propia de productos',
    'Precio único, sin diferencia por medio de pago',
  ];

  return (
    <>
      <DatosEstructurados sucursales={sucursales} />

      {/* ── Portada ──────────────────────────────────────────────────────── */}
      <section data-portada-oscura className="bg-tinta text-lino relative isolate overflow-hidden">
        <Imagen
          imagen={IMAGENES.inicio.portada}
          prioritaria
          sizes="100vw"
          className="portada-parallax absolute inset-0 -z-20"
        />

        {/*
          El velo corre en vertical en el teléfono, donde el texto queda sobre
          la foto, y en horizontal de tablet para arriba, que es cuando hay
          sitio para dejar el texto de un lado y los sillones del otro.
        */}
        <div
          aria-hidden
          className="from-tinta via-tinta/85 to-tinta/35 sm:via-tinta/65 absolute inset-0 -z-10 bg-gradient-to-t sm:bg-gradient-to-r sm:via-45% sm:to-transparent"
        />

        <Contenedor className="py-seccion relative flex min-h-[clamp(28rem,68vh,42rem)] items-center">
          <div className="max-w-[34rem]">
            <p className="versales text-nota mb-4 opacity-80">Buenos Aires</p>

            <h1 className="text-portada max-w-[13ch]">Peluquería para hombres</h1>

            <p className="text-guia mt-5 max-w-[42ch] opacity-85">
              Tres sucursales, turnos online y el mismo trabajo de siempre.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href={RUTAS.reservar}
                className={clasesBoton({ variante: 'solido-claro', tamanio: 'grande' })}
              >
                Reservar turno
              </Link>
              <Link
                href={RUTAS.servicios}
                className={clasesBoton({ variante: 'contorno-claro', tamanio: 'grande' })}
              >
                Ver servicios
              </Link>
            </div>
          </div>
        </Contenedor>
      </section>

      {/* ── Cinta de datos ───────────────────────────────────────────────── */}
      <Cinta piezas={piezasCinta} />

      {/* ── Nosotros ─────────────────────────────────────────────────────── */}
      <Seccion id={SECCIONES.nosotros} className="revelar">
        <Contenedor className="grid items-center gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          <div>
            <EncabezadoSeccion etiqueta="01 · Quiénes somos" titulo="El oficio" />

            <div className="text-guia text-grafito max-w-lectura mt-4 flex flex-col gap-3">
              <p>
                Trabajamos el corte como un oficio: se mide, se perfila y se termina a mano. No hay
                dos cabezas iguales, y el corte se piensa para cómo te vas a peinar todos los días,
                no para cómo queda el día que salís del local.
              </p>
              <p>
                Son tres locales con el mismo criterio. El equipo se forma adentro, así que el
                trabajo se parece más a sí mismo que al barrio donde se hace.
              </p>
            </div>

            {/* El número arriba y la etiqueta abajo. En el marcado va al revés
                porque una lista de definiciones se escribe término y después
                descripción; el orden visual lo da `flex-col-reverse`. */}
            <dl className="revelar-lista border-borde mt-7 flex flex-wrap gap-x-10 gap-y-4 border-t pt-5">
              {cifras.map((cifra) => (
                <div key={cifra.etiqueta} className="flex flex-col-reverse">
                  <dt className="versales text-nota text-grafito">{cifra.etiqueta}</dt>
                  <dd className="text-titulo">{cifra.valor}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Las dos fotografías van desfasadas a propósito: apiladas a la misma
              altura se leen como una tabla de contactos, escalonadas se leen
              como una página de revista. */}
          <div className="grid grid-cols-2 items-start gap-3 sm:gap-4">
            <Imagen
              imagen={IMAGENES.inicio.experiencia}
              sizes="(min-width: 1024px) 24vw, 45vw"
              className="rounded-tarjeta aspect-[3/4] object-cover"
            />
            <Imagen
              imagen={IMAGENES.servicios.corte}
              sizes="(min-width: 1024px) 24vw, 45vw"
              className="rounded-tarjeta aspect-[3/4] object-cover sm:mt-12"
            />
          </div>
        </Contenedor>
      </Seccion>

      {/* ── Cita ─────────────────────────────────────────────────────────── */}
      <section className="bg-tinta text-lino revelar relative isolate overflow-hidden">
        <Imagen
          imagen={IMAGENES.inicio.estudio}
          sizes="100vw"
          className="absolute inset-0 -z-20 object-[center_20%]"
        />

        {/*
          El velo va al revés que el de la portada: acá cae de arriba hacia
          abajo en el teléfono, porque la cita está arriba y la fotografía es de
          fondo claro. Con el degradado de la portada —que se abre hacia
          arriba— el texto caía sobre la parte más clara y el contraste se iba a
          3,2:1. De tablet para arriba corre hacia la derecha y deja el rostro a
          la vista.

          Medido componiendo la fotografía con el velo en un lienzo y buscando
          el píxel más claro que toca cada texto: 12,8:1 la cita y 6,4:1 la
          firma a 1100 px; 12,3:1 y 5,1:1 a 375. El mínimo de WCAG AA es 4,5:1
          para la firma —12 px— y 3:1 para la cita, que es texto grande.

          El tramo final del teléfono termina en 70 % y no en 30 % por la firma:
          con 30 % quedaba en 2,2:1. Si se vuelve a tocar este degradado, hay
          que volver a medir.
        */}
        <div
          aria-hidden
          className="from-tinta via-tinta/85 to-tinta/70 sm:via-tinta/80 absolute inset-0 -z-10 bg-gradient-to-b sm:bg-gradient-to-r sm:via-50% sm:to-transparent"
        />

        <Contenedor className="py-seccion">
          {/* El tope de ancho va en rem y no en `ch`: `ch` se mide con la letra
              del elemento donde está escrito, y acá la de la cita es del cuerpo
              mientras que la del texto es de 74 px, así que 18ch daba una
              columna de 180. Y va en la cita entera, no sólo en el párrafo,
              para que la firma quede también dentro del velo. */}
          <blockquote className="max-w-[34rem]">
            <p className="text-portada">Acá el corte no se apura: se termina.</p>
            <footer className="versales text-nota text-ceniza mt-6">
              El equipo de Manly Barber Studio
            </footer>
          </blockquote>
        </Contenedor>
      </section>

      {/* ── Servicios ────────────────────────────────────────────────────── */}
      <Seccion fondo="niebla" id={SECCIONES.servicios} className="revelar">
        <Contenedor>
          <EncabezadoSeccion
            etiqueta="02 · Qué hacemos"
            titulo="Servicios"
            bajada="Precio único, sin diferencia por medio de pago."
          />

          {servicios.length === 0 ? (
            <p className="text-menor text-grafito mt-bloque">
              No pudimos cargar el listado en este momento. Escribinos y te lo pasamos.
            </p>
          ) : (
            /* Grilla a hueso: las celdas no se separan, las divide un filete de
               un píxel. Con tarjetas sueltas, cada servicio flotaba en su
               propio blanco y la lista se leía desarmada.

               El filete lo dibuja cada celda por derecha y abajo, y el contenedor
               cierra por arriba y por izquierda. Hecho al revés —fondo gris
               asomando por un `gap` de un píxel— la última fila incompleta
               dejaría un bloque gris macizo donde faltan celdas. */
            <ul className="revelar-lista border-borde mt-bloque grid border-l border-t sm:grid-cols-2 lg:grid-cols-3">
              {servicios.map((servicio) => (
                <li key={servicio.id} className="border-borde flex flex-col border-b border-r p-6">
                  <div className="mb-6">
                    <h3 className="text-subtitulo">{servicio.nombre}</h3>

                    {servicio.descripcion ? (
                      <p className="text-menor text-grafito mt-2">{servicio.descripcion}</p>
                    ) : null}
                  </div>

                  {/* `mt-auto` alinea el pie de todas las celdas a la misma
                      altura aunque una tenga descripción y otra no. */}
                  <div className="border-borde mt-auto flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t pt-4">
                    <p className="versales text-nota text-grafito">
                      {formatearDuracion(servicio.duracionMinutos)}
                      {servicio.seniaCentavos > 0
                        ? ` · seña ${formatearPrecio(servicio.seniaCentavos)}`
                        : ''}
                    </p>

                    <p className="text-base">{formatearPrecio(servicio.precioCentavos)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <Link
            href={RUTAS.reservar}
            className={clasesBoton({ tamanio: 'grande', className: 'mt-bloque' })}
          >
            Reservar turno
          </Link>
        </Contenedor>
      </Seccion>

      {/* ── La línea propia ──────────────────────────────────────────────── */}
      <Seccion className="revelar">
        <Contenedor>
          <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
            <Imagen
              imagen={IMAGENES.marca.lineaProductos}
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="rounded-tarjeta aspect-[4/5] object-cover"
            />

            <div>
              <EncabezadoSeccion etiqueta="03 · Línea propia" titulo="Productos Manly" />

              <div className="text-guia text-grafito max-w-lectura mt-4 flex flex-col gap-3">
                <p>
                  Desarrollamos nuestros propios productos porque no encontrábamos lo que
                  buscábamos: fijación que aguante sin endurecer, acabado mate y base al agua para
                  que salga con una lavada.
                </p>
                <p>Son los mismos que usamos en el sillón y se consiguen en cualquier sucursal.</p>
              </div>

              <ul className="revelar-lista mt-7 grid grid-cols-3 gap-3 sm:gap-4">
                {PRODUCTOS.map((producto) => (
                  <li key={producto.imagen.ruta} className="flex flex-col">
                    <Imagen
                      imagen={producto.imagen}
                      sizes="(min-width: 1024px) 16vw, 30vw"
                      className="rounded-tarjeta bg-papel aspect-[4/5] object-cover"
                    />

                    <p className="versales text-nota text-grafito mt-3">{producto.detalle}</p>
                    <p className="text-menor mt-1">{producto.nombre}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Contenedor>
      </Seccion>

      {/* ── Sucursales ───────────────────────────────────────────────────── */}
      <Seccion fondo="niebla" id={SECCIONES.sucursales} className="revelar">
        <Contenedor>
          <EncabezadoSeccion
            etiqueta="04 · Dónde estamos"
            titulo="Nuestras sucursales"
            bajada="Tres locales en Buenos Aires. Elegí el que te queda más cómodo."
          />

          {sucursales.length === 0 ? (
            <p className="text-menor text-grafito mt-bloque">
              No pudimos cargar las sucursales en este momento.
            </p>
          ) : (
            /* Cada tarjeta trae también el contacto de esa sucursal. Antes era
               una sección aparte que volvía a listar las mismas tres, y el
               teléfono del local terminaba lejos de su dirección. Los campos
               vacíos no se dibujan: es mejor que un enlace que no lleva a
               ningún lado. */
            <ul className="revelar-lista border-borde mt-bloque grid border-l border-t sm:grid-cols-2 lg:grid-cols-3">
              {sucursales.map((sucursal) => (
                <li key={sucursal.id} className="border-borde flex flex-col border-b border-r p-6">
                  <p className="versales text-nota text-grafito">{sucursal.barrio}</p>

                  <h3 className="text-subtitulo mt-2">{sucursal.nombre}</h3>
                  <p className="text-menor text-grafito mt-1">{sucursal.direccion}</p>

                  <div className="text-menor mb-6 mt-3 flex flex-wrap items-center gap-x-5">
                    {sucursal.whatsapp ? (
                      <a
                        href={`https://wa.me/${sucursal.whatsapp}`}
                        rel="noopener noreferrer"
                        target="_blank"
                        className="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
                      >
                        WhatsApp
                      </a>
                    ) : null}

                    {sucursal.telefono ? (
                      <a
                        href={`tel:${sucursal.telefono}`}
                        className="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
                      >
                        {sucursal.telefono}
                      </a>
                    ) : null}

                    {sucursal.urlMapa ? (
                      <a
                        href={sucursal.urlMapa}
                        rel="noopener noreferrer"
                        target="_blank"
                        className="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
                      >
                        Cómo llegar
                      </a>
                    ) : null}
                  </div>

                  <Link
                    href={`${RUTAS.reservar}?sucursal=${sucursal.id}`}
                    className={clasesBoton({ variante: 'contorno', className: 'mt-auto w-full' })}
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

      {/* ── Contacto y cierre ────────────────────────────────────────────── */}
      <Seccion fondo="invertido" id={SECCIONES.contacto} className="revelar">
        <Contenedor
          className={cn(
            'grid items-center gap-8 lg:gap-14',
            conWhatsapp.length > 0 && 'lg:grid-cols-2',
          )}
        >
          <div>
            <EncabezadoSeccion
              sobreOscuro
              etiqueta="05 · Contacto"
              titulo="Reservá en un minuto"
              bajada="Elegís sucursal, servicio y horario. No hace falta llamar ni esperar una respuesta."
            />

            <Link
              href={RUTAS.reservar}
              className={clasesBoton({
                variante: 'solido-claro',
                tamanio: 'grande',
                className: 'mt-7',
              })}
            >
              Reservar turno
            </Link>
          </div>

          {/* Atajo directo al local, para lo que no se resuelve reservando. Van
              como fichas y no como tarjetas: los datos completos están arriba,
              acá lo único que hace falta es tocar y escribir. */}
          {conWhatsapp.length > 0 ? (
            <div>
              <p className="versales text-nota text-ceniza">¿Alguna consulta antes de reservar?</p>

              <ul className="revelar-lista mt-4 flex flex-wrap gap-2">
                {conWhatsapp.map((sucursal) => (
                  <li key={sucursal.id}>
                    <a
                      href={`https://wa.me/${sucursal.whatsapp}`}
                      rel="noopener noreferrer"
                      target="_blank"
                      className={clasesBoton({ variante: 'contorno-claro' })}
                    >
                      {sucursal.nombre}
                    </a>
                  </li>
                ))}
              </ul>

              <p className="text-nota text-ceniza mt-4">
                Escribinos por WhatsApp a la sucursal que te quede más cómoda.
              </p>
            </div>
          ) : null}
        </Contenedor>
      </Seccion>
    </>
  );
}
