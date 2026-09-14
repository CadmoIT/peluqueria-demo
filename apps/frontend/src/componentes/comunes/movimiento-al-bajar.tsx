'use client';

// Respaldo del movimiento al bajar, para los navegadores que todavía no tienen
// líneas de tiempo de desplazamiento.
//
// Lo primero es el CSS: donde `animation-timeline` existe —Chrome y Edge— las
// animaciones las resuelve la hoja de estilos, sin JavaScript y sin que este
// componente haga nada. Firefox todavía no la implementa, y ahí el sitio se
// quedaba completamente quieto.
//
// **Este respaldo sólo agrega movimiento; nunca esconde.** Es la diferencia
// que lo hace seguro: el patrón habitual —tapar todo con CSS y destapar desde
// un observador— deja la página vacía si el script no corre. Acá, si esto
// falla, lo único que pasa es que las secciones no se mueven.
//
// Por eso las transformaciones cuelgan de `data-movimiento-js`, que se pone
// desde acá: hasta que este código no corre, el CSS de respaldo no existe.
import { useEffect } from 'react';

/** Cuánto baja la fotografía de portada, en proporción a su alto. */
const RECORRIDO_PORTADA = 0.04;

/** La escala se abre de cerrada a suelta mientras se baja la primera pantalla. */
const ESCALA_INICIAL = 1.35;
const ESCALA_FINAL = 1.12;

export function MovimientoAlBajar() {
  useEffect(() => {
    // Donde el CSS ya sabe hacerlo, este componente se aparta.
    if (CSS.supports('animation-timeline: view()')) return;

    // Y si se pidió movimiento reducido, no hay respaldo que valga: la
    // preferencia gana sobre cualquier efecto.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const raiz = document.documentElement;

    raiz.dataset.movimientoJs = '';

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (!entrada.isIntersecting) continue;

          // Una vez que entró, no hace falta seguir mirándola.
          (entrada.target as HTMLElement).dataset.aLaVista = '';
          observador.unobserve(entrada.target);
        }
      },
      // Se dispara un poco antes de que asome del todo, para que el movimiento
      // termine cuando la sección ya está a la vista y no después.
      { rootMargin: '0px 0px -12% 0px' },
    );

    for (const elemento of document.querySelectorAll('.revelar, .revelar-tarjeta')) {
      observador.observe(elemento);
    }

    const portada = document.querySelector<HTMLElement>('.portada-parallax');
    let pendiente = 0;

    function alDesplazar() {
      if (pendiente) return;

      pendiente = requestAnimationFrame(() => {
        pendiente = 0;

        if (!portada) return;

        const avance = Math.min(window.scrollY / window.innerHeight, 1);

        portada.style.setProperty(
          '--desplazamiento-portada',
          `${String(avance * RECORRIDO_PORTADA * portada.offsetHeight)}px`,
        );

        portada.style.setProperty(
          '--escala-portada',
          String(ESCALA_INICIAL + (ESCALA_FINAL - ESCALA_INICIAL) * avance),
        );
      });
    }

    if (portada) {
      alDesplazar();
      window.addEventListener('scroll', alDesplazar, { passive: true });
    }

    return () => {
      observador.disconnect();
      window.removeEventListener('scroll', alDesplazar);
      if (pendiente) cancelAnimationFrame(pendiente);
      delete raiz.dataset.movimientoJs;
    };
  }, []);

  return null;
}
