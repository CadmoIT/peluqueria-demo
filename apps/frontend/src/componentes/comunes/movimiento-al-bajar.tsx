'use client';

// Hace aparecer las secciones y las tarjetas a medida que se baja.
//
// **Por qué no lo resuelve el CSS solo.** Se intentó con líneas de tiempo de
// desplazamiento y el resultado era invisible: atado al scroll, el elemento se
// mueve *en proporción* a cuánto bajaste, y eso se lee como profundidad, no
// como aparición. Peor todavía, el recorrido terminaba con la sección ya en
// pantalla, así que para cuando la mirabas ya estaba quieta.
//
// Una aparición se dispara al entrar y corre por tiempo. Eso necesita un
// observador, y por eso este componente existe.
//
// **Nunca esconde sin poder mostrar.** El CSS que oculta cuelga de
// `data-movimiento-js`, que se pone acá: si este script no corre, esas reglas
// no aplican y la página se ve entera. Al revés —esconder desde el CSS y
// destapar desde el script— cualquier falla dejaría la página en blanco.
import { useEffect } from 'react';

/** Cuánto baja la fotografía de portada, en proporción a su alto. */
const RECORRIDO_PORTADA = 0.04;

/** La escala se abre de cerrada a suelta mientras se baja la primera pantalla. */
const ESCALA_INICIAL = 1.35;
const ESCALA_FINAL = 1.12;

export function MovimientoAlBajar() {
  useEffect(() => {
    // La preferencia del sistema gana sobre cualquier efecto. Sin el atributo
    // no hay nada oculto ni nada que animar.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const raiz = document.documentElement;

    raiz.dataset.movimientoJs = '';

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (!entrada.isIntersecting) continue;

          // Una vez que apareció, no hace falta seguir mirándola: la aparición
          // se ve una sola vez, no cada vez que se pasa por delante.
          (entrada.target as HTMLElement).dataset.aLaVista = '';
          observador.unobserve(entrada.target);
        }
      },
      // Pide que asome un poco antes de disparar, para que la aparición ocurra
      // con el elemento entrando y no cuando todavía está fuera de cuadro.
      { rootMargin: '0px 0px -10% 0px', threshold: 0.01 },
    );

    // El contenido llega por partes: este componente vive en el layout, que se
    // monta antes que la página. Buscar una sola vez al montar significaba
    // observar lo que existiera en ese instante y perderse el resto, así que se
    // vuelve a mirar cada vez que el DOM cambia.
    //
    // Se observan sólo las secciones. Las tarjetas cuelgan de la suya por CSS:
    // su alto depende de imágenes que pueden no estar medidas, y un elemento
    // sin área nunca dispara un observador.
    //
    // `data-observado` evita volver a observar lo mismo; sin esa marca, cada
    // cambio del DOM reobservaría toda la lista.
    function observarNuevos() {
      const nuevos = document.querySelectorAll(
        '.revelar:not([data-observado])',
      );

      for (const elemento of nuevos) {
        (elemento as HTMLElement).dataset.observado = '';
        observador.observe(elemento);
      }
    }

    observarNuevos();

    const vigilante = new MutationObserver(observarNuevos);

    vigilante.observe(document.body, { childList: true, subtree: true });

    // La portada es lo único que sí va atado al desplazamiento: es un
    // travelling, no una aparición. Donde el CSS sabe hacerlo, se deja.
    const cssResuelveLaPortada = CSS.supports('animation-timeline: scroll()');

    let portada: HTMLElement | null = null;
    let pendiente = 0;

    function alDesplazar() {
      if (pendiente) return;

      pendiente = requestAnimationFrame(() => {
        pendiente = 0;

        // Se busca en cada cuadro y no una sola vez, por lo mismo que arriba:
        // la portada puede no existir todavía cuando esto arranca.
        portada ??= document.querySelector<HTMLElement>('.portada-parallax');

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

    if (!cssResuelveLaPortada) {
      alDesplazar();
      window.addEventListener('scroll', alDesplazar, { passive: true });
    }

    return () => {
      observador.disconnect();
      vigilante.disconnect();
      window.removeEventListener('scroll', alDesplazar);
      if (pendiente) cancelAnimationFrame(pendiente);
      delete raiz.dataset.movimientoJs;
    };
  }, []);

  return null;
}
