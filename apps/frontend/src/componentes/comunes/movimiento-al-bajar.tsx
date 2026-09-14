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
//
// **Y no escribe nada en los elementos.** La primera versión marcaba cada uno
// con `data-a-la-vista`, y React protestaba: el contenido llega por partes, así
// que esas marcas caían sobre elementos que todavía no había hidratado y se
// encontraba con atributos que él no puso. Por eso el registro va en un
// `WeakSet` y el movimiento por la API de animaciones, que no toca ni
// atributos ni estilos en línea.
import { useEffect } from 'react';

/** El mismo suavizado que usa el resto del sitio, en `tokens.css`. */
const SUAVIZADO = 'cubic-bezier(0.16, 1, 0.3, 1)';

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

    /** Lleva el registro en memoria: marcar el DOM rompería la hidratación. */
    const yaObservados = new WeakSet<Element>();

    /** El viaje desde el estado inicial que puso el CSS hasta su sitio. */
    function aparecer(elemento: Element, desplazamiento: string, retardo: number) {
      elemento.animate(
        [
          { opacity: 0, transform: desplazamiento },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 520, delay: retardo, easing: SUAVIZADO, fill: 'forwards' },
      );
    }

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (!entrada.isIntersecting) continue;

          // Se ve una sola vez, no cada vez que se pasa por delante.
          observador.unobserve(entrada.target);

          aparecer(entrada.target, 'translateY(48px)', 0);

          // Las tarjetas las dispara su sección y no un observador propio: su
          // alto depende de imágenes que pueden no estar medidas todavía, y un
          // elemento sin área nunca "entra" en pantalla. La sección siempre
          // tiene alto. El escalonado sale del orden, con tope para que una
          // lista larga no termine de aparecer cuando ya pasaste de largo.
          const tarjetas = entrada.target.querySelectorAll('.revelar-lista > *');

          for (const [indice, tarjeta] of tarjetas.entries()) {
            aparecer(tarjeta, 'translateY(36px) scale(0.96)', 160 + Math.min(indice, 3) * 100);
          }
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
    function observarNuevos() {
      for (const elemento of document.querySelectorAll('.revelar')) {
        if (yaObservados.has(elemento)) continue;

        yaObservados.add(elemento);
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

        // Las variables van en la raíz y no en la imagen: el `style` de la
        // imagen lo maneja React —le pone `color: transparent`— y escribir ahí
        // le hace ver un estilo en línea que él no puso. Las propiedades
        // personalizadas se heredan, así que desde la raíz llegan igual.
        raiz.style.setProperty(
          '--desplazamiento-portada',
          `${String(avance * RECORRIDO_PORTADA * portada.offsetHeight)}px`,
        );

        raiz.style.setProperty(
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
      raiz.style.removeProperty('--desplazamiento-portada');
      raiz.style.removeProperty('--escala-portada');
      delete raiz.dataset.movimientoJs;
    };
  }, []);

  return null;
}
