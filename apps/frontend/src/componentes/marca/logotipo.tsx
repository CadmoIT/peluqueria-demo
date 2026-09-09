// Logotipo de Manly Barber Studio.
//
// El nombre en la serif de alto contraste de la marca, con el descriptor en
// versales espaciadas debajo, tal como aparece en el packaging.
//
// **Falta el vectorial oficial.** La marca real lleva el asta derecha de la M
// rayada como un poste de barbería; reproducir ese detalle a mano sobre la
// tipografía queda peor que no ponerlo, así que se omite hasta tener el archivo.
//
// Hereda el color del texto, así funciona igual sobre fondo claro y sobre el
// negro pleno de la marca sin necesitar dos versiones.
import { cn } from '@manly/interfaz';

interface Propiedades {
  /** Alto en píxeles del conjunto. El ancho se calcula manteniendo la proporción. */
  alto?: number;
  /** Oculta el descriptor "Barber Studio", para espacios muy chicos. */
  soloNombre?: boolean;
  className?: string;
}

export function Logotipo({ alto = 30, soloNombre = false, className }: Propiedades) {
  const altoCaja = soloNombre ? 48 : 68;

  return (
    <svg
      viewBox={`0 0 240 ${String(altoCaja)}`}
      height={alto}
      width={(alto * 240) / altoCaja}
      role="img"
      aria-label="Manly Barber Studio"
      className={cn('text-current', className)}
    >
      <title>Manly Barber Studio</title>

      <text
        x="120"
        y="38"
        textAnchor="middle"
        fontFamily="var(--font-titulo)"
        fontSize="40"
        letterSpacing="2"
        fill="currentColor"
      >
        MANLY
      </text>

      {!soloNombre && (
        <text
          x="120"
          y="58"
          textAnchor="middle"
          fontFamily="var(--font-texto)"
          fontSize="10"
          fontWeight="500"
          letterSpacing="4.8"
          fill="currentColor"
        >
          BARBER STUDIO
        </text>
      )}
    </svg>
  );
}
