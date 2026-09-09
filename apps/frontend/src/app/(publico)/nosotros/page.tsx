// Página institucional.
//
// Los textos son un borrador armado con lo que se ve en el material de la
// marca: la línea de productos, el tipo de trabajo y las tres sucursales. Hay
// que reemplazarlos por los definitivos de Manly.
import type { Metadata } from 'next';
import Link from 'next/link';

import { Contenedor, EncabezadoSeccion, Seccion } from '@manly/interfaz';

import { Imagen } from '@/componentes/comunes/imagen';
import { IMAGENES } from '@/utilidades/imagenes';
import { RUTAS } from '@/utilidades/rutas';

export const metadata: Metadata = {
  title: 'Nosotros',
  description:
    'Manly Barber Studio: cortes de precisión, barba y línea propia de productos en Buenos Aires.',
  alternates: { canonical: '/nosotros' },
};

export default function PaginaNosotros() {
  return (
    <>
      <Seccion>
        <Contenedor>
          <EncabezadoSeccion
            etiqueta="Quiénes somos"
            titulo="Manly Barber Studio"
            bajada="Un estudio de barbería en Buenos Aires, con tres sucursales y una línea propia de productos para el pelo."
            nivel={1}
          />
        </Contenedor>
      </Seccion>

      <Seccion fondo="niebla">
        <Contenedor className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <h2 className="text-titulo">El oficio</h2>

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
            imagen={IMAGENES.servicios.corte}
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="rounded-tarjeta aspect-[3/4] object-cover"
          />
        </Contenedor>
      </Seccion>

      <Seccion>
        <Contenedor className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <Imagen
            imagen={IMAGENES.marca.lineaProductos}
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="rounded-tarjeta aspect-[3/4] object-cover"
          />

          <div>
            <h2 className="text-titulo">La línea propia</h2>

            <div className="text-guia text-grafito max-w-lectura mt-5 flex flex-col gap-4">
              <p>
                Desarrollamos nuestros propios productos porque no encontrábamos lo que buscábamos:
                fijación que aguante sin endurecer, acabado mate y base al agua para que salga con
                una lavada.
              </p>
              <p>
                <strong className="text-tinta">Pendiente:</strong> reemplazar por el texto
                definitivo y sumar el detalle de cada producto.
              </p>
            </div>
          </div>
        </Contenedor>
      </Seccion>

      <Seccion fondo="invertido">
        <Contenedor className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <EncabezadoSeccion titulo="Vení a conocernos" className="max-w-[20ch]" />
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
