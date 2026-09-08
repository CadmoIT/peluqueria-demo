// Pie del sitio público: navegación secundaria, sucursales y datos de contacto.
import Link from 'next/link';

import { Contenedor } from '@manly/interfaz';

import { Logotipo } from '@/componentes/marca/logotipo';
import { NAVEGACION_PRINCIPAL, RUTAS } from '@/utilidades/rutas';
import { SUCURSALES } from '@/utilidades/sucursales';

export function PieDePagina() {
  const anio = new Date().getFullYear();

  return (
    <footer className="bg-tinta text-lino">
      <Contenedor className="py-bloque">
        <div className="grid gap-10 py-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-4">
            <Logotipo alto={26} />
            <p className="text-menor text-humo max-w-64">
              Peluquería para hombres en Buenos Aires.
            </p>
          </div>

          <nav aria-label="Secundaria">
            <h2 className="versales text-nota text-humo mb-4">Navegación</h2>
            <ul className="flex flex-col gap-2">
              {NAVEGACION_PRINCIPAL.map((enlace) => (
                <li key={enlace.href}>
                  <Link
                    href={enlace.href}
                    className="text-menor hover:text-humo inline-flex min-h-11 items-center transition-colors sm:min-h-0"
                  >
                    {enlace.etiqueta}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="versales text-nota text-humo mb-4">Sucursales</h2>
            <ul className="flex flex-col gap-2">
              {SUCURSALES.map((sucursal) => (
                <li key={sucursal.id} className="text-menor">
                  <span className="block">{sucursal.nombre}</span>
                  <span className="text-humo">{sucursal.barrio}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-4">
            <h2 className="versales text-nota text-humo">Reservá tu turno</h2>
            <Link
              href={RUTAS.reservar}
              className="versales border-lino rounded-manly hover:bg-lino hover:text-tinta text-menor duration-(--duracion-rapida) inline-flex min-h-11 items-center justify-center border px-5 transition-colors"
            >
              Reservar
            </Link>
          </div>
        </div>

        <div className="border-carbon flex flex-col gap-2 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-nota text-humo">© {anio} Manly</p>
          <Link
            href={RUTAS.panel}
            className="text-nota text-humo hover:text-lino transition-colors"
          >
            Acceso del equipo
          </Link>
        </div>
      </Contenedor>
    </footer>
  );
}
