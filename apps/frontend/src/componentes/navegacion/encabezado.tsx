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
  // Arranca oscuro en el inicio, que hoy es la única página con portada
  // oscura. No es un atajo por comodidad: el servidor no puede consultar el
  // DOM, así que sin esta suposición la barra se pinta clara y salta a oscura
  // al hidratar, y ese salto se ve en cada carga.
  //
  // Es una suposición, no la verdad: el observador de más abajo la confirma o
  // la corrige apenas monta, y él es el que manda. Si otra página estrena
  // portada oscura, se verá el salto hasta que se la agregue acá.
  const [sobrePortada, setSobrePortada] = useState(rutaActual === RUTAS.inicio);
  const idPanel = useId();
  const botonRef = useRef<HTMLButtonElement>(null);
  const encabezadoRef = useRef<HTMLElement>(null);

  // El encabezado se oscurece mientras la barra está sobre una portada oscura,
  // y vuelve al fondo claro apenas la portada termina. Las páginas que no
  // tienen portada oscura no marcan nada y el encabezado se queda claro.
  //
  // Se resuelve con un observador y no escuchando el desplazamiento: el
  // observador sólo avisa cuando el estado cambia, en vez de correr código en
  // cada píxel que se baja.
  useEffect(() => {
    const portada = document.querySelector('[data-portada-oscura]');

    if (!portada) {
      setSobrePortada(false);
      return;
    }

    // El margen negativo sube el borde de referencia hasta donde termina la
    // barra: así deja de considerarse "sobre la portada" cuando la portada
    // pasó por debajo del encabezado, y no cuando salió de la pantalla.
    const alto = encabezadoRef.current?.offsetHeight ?? 80;

    // Primera respuesta sin esperar al observador: su primer aviso llega en el
    // cuadro siguiente, y hasta entonces la barra se vería clara sobre una
    // portada oscura.
    setSobrePortada(portada.getBoundingClientRect().bottom > alto);

    const observador = new IntersectionObserver(
      ([entrada]) => setSobrePortada(entrada?.isIntersecting ?? false),
      { rootMargin: `-${String(alto)}px 0px 0px 0px` },
    );

    observador.observe(portada);
    return () => observador.disconnect();
  }, [rutaActual]);

  // Con el panel desplegado el encabezado vuelve al fondo claro: el panel es
  // claro, y una barra oscura encima de él se lee como otro elemento.
  const oscuro = sobrePortada && !abierto;

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
    <header
      ref={encabezadoRef}
      className={cn(
        'duration-(--duracion-rapida) sticky top-0 z-50 border-b backdrop-blur-sm transition-colors',
        oscuro ? 'bg-tinta/80 text-lino border-transparent' : 'bg-lino/90 border-borde',
      )}
    >
      <Contenedor className="flex h-16 items-center justify-between gap-4 sm:h-20">
        <Link href={RUTAS.inicio} aria-label="Manly, ir al inicio" className="shrink-0">
          <Logotipo alto={24} />
        </Link>

        <nav aria-label="Principal" className="hidden md:block">
          <ul className="flex items-center gap-8">
            {NAVEGACION_PRINCIPAL.map((enlace) => (
              <li key={enlace.href}>
                <EnlaceNav enlace={enlace} rutaActual={rutaActual} oscuro={oscuro} />
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href={RUTAS.reservar}
            className={cn(
              'versales rounded-manly text-menor duration-(--duracion-rapida) hidden min-h-11 items-center px-5 transition-colors sm:inline-flex',
              oscuro ? 'bg-lino text-tinta hover:bg-white' : 'bg-tinta text-lino hover:bg-carbon',
            )}
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
  oscuro,
}: {
  enlace: { etiqueta: string; href: string };
  rutaActual: string;
  oscuro: boolean;
}) {
  const activo = rutaActual === enlace.href;
  // Sobre el fondo oscuro no sirve `grafito`: es un gris pensado para papel y
  // ahí abajo no llega al contraste que hace falta. La jerarquía la da
  // `ceniza`, que es el gris de los fondos oscuros.
  const tono = oscuro
    ? activo
      ? 'text-lino'
      : 'text-ceniza hover:text-lino'
    : activo
      ? 'text-tinta'
      : 'text-grafito hover:text-tinta';

  return (
    <Link
      href={enlace.href}
      aria-current={activo ? 'page' : undefined}
      className={cn('versales text-nota duration-(--duracion-rapida) transition-colors', tono)}
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
