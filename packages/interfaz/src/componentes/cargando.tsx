// Indicador de carga: unas tijeras que abren, cortan y dejan caer el mechón.
//
// Es un dibujo a línea, trazo negro sobre el fondo claro del sitio, sin
// relleno ni sombras salvo el remache.
//
// Las hojas son siluetas afiladas y no dos rayas cruzadas. Se probó primero
// con rayas y no se leía "tijera": se leía una equis con dos anillas colgando.
// La forma que lo resuelve es el filo que se va angostando hasta la punta.
//
// La mitad de abajo es la de arriba espejada sobre y=50, para que las dos
// hojas sean idénticas de verdad y no dos dibujos parecidos. El espejo va en
// un grupo interior: el exterior lo necesita libre para la animación, porque
// una transformación en CSS pisa al atributo `transform` del SVG.
//
// El movimiento vive en `tokens.css` y no acá por una razón concreta: la hoja
// de estilos ya apaga toda animación cuando el sistema pide movimiento
// reducido. Animado con SMIL —`<animateTransform>`— esa regla no lo alcanzaría,
// porque el CSS no puede frenar una animación del SVG.
//
// Por eso mismo el último fotograma de cada animación es el estado en reposo:
// con movimiento reducido el navegador salta al final, y ahí las tijeras
// quedan cerradas y el mechón invisible, que es el dibujo quieto.
import { cn } from '../utilidades';

interface Propiedades {
  /**
   * Qué se está esperando. Va debajo del dibujo y es lo que anuncia un lector
   * de pantalla: "Cargando…" a secas no dice de qué.
   */
  mensaje?: string;
  className?: string;
}

/** Filo, mango y anilla de una hoja. La otra es esta misma, espejada. */
const HOJA = (
  <>
    <path d="M14 22C30 30 46 40 60 47C46 44 28 32 14 22Z" />
    <path d="M60 52C68 58 72 63 76 69" />
    <circle cx="83" cy="76" r="8" />
  </>
);

export function Cargando({ mensaje = 'Cargando…', className }: Propiedades) {
  return (
    // El color va en el contenedor y no en el SVG: así el dibujo lo hereda y
    // quien lo use sobre un fondo oscuro puede invertirlo pasando `className`.
    <div
      role="status"
      className={cn('text-tinta flex flex-col items-center gap-4 py-10', className)}
    >
      <svg
        width="96"
        height="96"
        viewBox="0 0 100 100"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {/* El pelo va primero: las tijeras lo cruzan por delante. */}
        <g opacity="0.55">
          <path d="M13 5c3 14-3 20 0 31s-4 21-1 33" />
          <path d="M24 4c3 15-4 22 0 33s-4 22 0 34" />
          <path d="M35 6c3 14-4 21 0 32s-3 21 1 32" />
        </g>

        {/* El mechón cortado: aparece con el tijeretazo y cae. */}
        <g className="tijeras-mechon" opacity="0.55">
          <path d="M20 56c3 6 1 10-1 14" />
          <path d="M31 58c-3 6-1 10 1 13" />
        </g>

        <g className="tijeras-hoja-arriba">{HOJA}</g>

        <g className="tijeras-hoja-abajo">
          <g transform="matrix(1 0 0 -1 0 100)">{HOJA}</g>
        </g>

        {/* El remache. Relleno a propósito: es el único punto sólido del dibujo
            y es lo que ancla las dos hojas a la vista. */}
        <circle cx="58" cy="50" r="2.6" fill="currentColor" stroke="none" />
      </svg>

      <p className="text-menor text-humo">{mensaje}</p>
    </div>
  );
}
