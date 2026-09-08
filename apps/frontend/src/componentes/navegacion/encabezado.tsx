'use client';

// Encabezado del sitio público. Diseñado primero a 360 px: en móvil colapsa en
// un panel desplegable y a partir de md muestra la navegación completa.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';

import { cn, Contenedor } from '@manly/interfaz';

import { Logotipo } from '@/componentes/marca/logotipo';
import { NAVEGACION_PRINCIPAL, RUTAS } from '@/utilidades/rutas';

export function Encabezado() {
  const [abierto, setAbierto] = useState(false);
  const rutaActual = usePathname();
  const idPanel = useId();
  const botonRef = useRef<HTMLButtonElement>(null);

  // El panel se cierra al navegar: si no, queda abierto sobre la página nueva.
  useEffect(() => {
    setAbierto(false);
  }, [rutaActual]);

  // Escape cierra el panel y devuelve el foco al botón que lo abrió.
  useEffect(() => {
    if (!abierto) return;

    function alPresionar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') {
        setAbierto(false);
        botonRef.current?.focus();
      }
    }

    document.addEventListener('keydown', alPresionar);
    return () => document.removeEventListener('keydown', alPresionar);
  }, [abierto]);

  // Con el panel abierto no se desplaza el contenido de atrás.
  useEffect(() => {
    document.body.style.overflow = abierto ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [abierto]);

  return (
    <header className="bg-lino/90 border-borde sticky top-0 z-50 border-b backdrop-blur-sm">
      <Contenedor className="flex h-16 items-center justify-between gap-4 sm:h-20">
        <Link href={RUTAS.inicio} aria-label="Manly, ir al inicio" className="shrink-0">
          <Logotipo alto={24} />
        </Link>

        <nav aria-label="Principal" className="hidden md:block">
          <ul className="flex items-center gap-8">
            {NAVEGACION_PRINCIPAL.map((enlace) => (
              <li key={enlace.href}>
                <EnlaceNav enlace={enlace} rutaActual={rutaActual} />
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href={RUTAS.reservar}
            className="versales bg-tinta text-lino rounded-manly hover:bg-carbon text-menor duration-(--duracion-rapida) hidden min-h-11 items-center px-5 transition-colors sm:inline-flex"
          >
            Reservar
          </Link>

          <button
            ref={botonRef}
            type="button"
            onClick={() => setAbierto((previo) => !previo)}
            aria-expanded={abierto}
            aria-controls={idPanel}
            className="-mr-2 inline-flex size-11 items-center justify-center md:hidden"
          >
            <span className="sr-only">{abierto ? 'Cerrar menú' : 'Abrir menú'}</span>
            <IconoMenu abierto={abierto} />
          </button>
        </div>
      </Contenedor>

      <div id={idPanel} hidden={!abierto} className="border-borde bg-lino border-t md:hidden">
        <Contenedor className="py-6">
          <nav aria-label="Principal móvil">
            <ul className="flex flex-col gap-1">
              {NAVEGACION_PRINCIPAL.map((enlace) => (
                <li key={enlace.href}>
                  <Link
                    href={enlace.href}
                    aria-current={rutaActual === enlace.href ? 'page' : undefined}
                    className={cn(
                      'versales text-menor flex min-h-11 items-center',
                      rutaActual === enlace.href ? 'text-tinta' : 'text-grafito',
                    )}
                  >
                    {enlace.etiqueta}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <Link
            href={RUTAS.reservar}
            className="versales bg-tinta text-lino rounded-manly text-menor mt-4 flex min-h-11 items-center justify-center px-5"
          >
            Reservar turno
          </Link>
        </Contenedor>
      </div>
    </header>
  );
}

function EnlaceNav({
  enlace,
  rutaActual,
}: {
  enlace: { etiqueta: string; href: string };
  rutaActual: string;
}) {
  const activo = rutaActual === enlace.href;

  return (
    <Link
      href={enlace.href}
      aria-current={activo ? 'page' : undefined}
      className={cn(
        'versales text-nota duration-(--duracion-rapida) transition-colors',
        activo ? 'text-tinta' : 'text-grafito hover:text-tinta',
      )}
    >
      {enlace.etiqueta}
    </Link>
  );
}

/** Hamburguesa que se transforma en cruz. Decorativo: el texto va en sr-only. */
function IconoMenu({ abierto }: { abierto: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" fill="none">
      <line
        x1="2"
        y1={abierto ? '11' : '6'}
        x2="20"
        y2={abierto ? '11' : '6'}
        stroke="currentColor"
        strokeWidth="1.5"
        style={{ transformOrigin: 'center', transform: abierto ? 'rotate(45deg)' : 'none' }}
        className="duration-(--duracion-rapida) ease-manly transition-transform"
      />
      <line
        x1="2"
        y1="11"
        x2="20"
        y2="11"
        stroke="currentColor"
        strokeWidth="1.5"
        className="duration-(--duracion-rapida) transition-opacity"
        style={{ opacity: abierto ? 0 : 1 }}
      />
      <line
        x1="2"
        y1={abierto ? '11' : '16'}
        x2="20"
        y2={abierto ? '11' : '16'}
        stroke="currentColor"
        strokeWidth="1.5"
        style={{ transformOrigin: 'center', transform: abierto ? 'rotate(-45deg)' : 'none' }}
        className="duration-(--duracion-rapida) ease-manly transition-transform"
      />
    </svg>
  );
}
