// Pie del sitio público: navegación secundaria, sucursales y datos de contacto.
//
// Las sucursales salen de la API, no de una lista escrita a mano: si no, abrir
// o cerrar un local obligaría a tocar el código, y el pie terminaría diciendo
// algo distinto al resto del sitio.
import Link from 'next/link';

import { Contenedor } from '@manly/interfaz';
import type { SucursalPublica } from '@manly/contratos';

import { Logotipo } from '@/componentes/marca/logotipo';
import { consultarApi } from '@/servicios/api';
import { NAVEGACION_PRINCIPAL, RUTAS } from '@/utilidades/rutas';

export async function PieDePagina() {
  const anio = new Date().getFullYear();
  const sucursales = await consultarApi<SucursalPublica[]>('/sucursales').catch(() => []);

  return (
    <footer className="bg-tinta text-lino">
      <Contenedor className="py-bloque">
        <div className="grid gap-10 py-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-4">
            <Logotipo alto={30} />
            <p className="text-menor text-ceniza max-w-64">
              Peluquería para hombres en Buenos Aires.
            </p>
          </div>

          <nav aria-label="Secundaria">
            <h2 className="versales text-nota text-ceniza mb-4">Navegación</h2>
            <ul className="flex flex-col gap-2">
              {NAVEGACION_PRINCIPAL.map((enlace) => (
                <li key={enlace.href}>
                  <Link
                    href={enlace.href}
                    className="text-menor hover:text-ceniza inline-flex min-h-11 items-center transition-colors sm:min-h-0"
                  >
                    {enlace.etiqueta}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="versales text-nota text-ceniza mb-4">Sucursales</h2>
            <ul className="flex flex-col gap-2">
              {sucursales.map((sucursal) => (
                <li key={sucursal.id} className="text-menor">
                  <span className="block">{sucursal.nombre}</span>
                  <span className="text-ceniza">{sucursal.barrio}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-4">
            <h2 className="versales text-nota text-ceniza">Reservá tu turno</h2>
            <Link
              href={RUTAS.reservar}
              className="versales border-lino rounded-manly hover:bg-lino hover:text-tinta text-menor duration-(--duracion-rapida) inline-flex min-h-11 items-center justify-center border px-5 transition-colors"
            >
              Reservar
            </Link>
          </div>
        </div>

        <div className="border-carbon flex flex-col gap-2 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-nota text-ceniza">© {anio} Manly Barber Studio</p>
          <Link
            href={RUTAS.panel}
            className="text-nota text-ceniza py-1 transition-colors hover:text-lino"
          >
            Acceso del equipo
          </Link>
        </div>
      </Contenedor>
    </footer>
  );
}
