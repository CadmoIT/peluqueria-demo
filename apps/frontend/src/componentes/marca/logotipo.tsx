// Logotipo de Manly. Hereda el color del texto, así funciona igual sobre fondo
// claro y sobre el negro pleno de la marca sin necesitar dos archivos.
import { cn } from '@manly/interfaz';

interface Propiedades {
  /** Alto en píxeles. El ancho se calcula manteniendo la proporción 3:1. */
  alto?: number;
  className?: string;
}

export function Logotipo({ alto = 28, className }: Propiedades) {
  return (
    <svg
      viewBox="0 0 240 80"
      height={alto}
      width={alto * 3}
      role="img"
      aria-label="Manly"
      className={cn('text-current', className)}
    >
      <text
        x="120"
        y="52"
        textAnchor="middle"
        fontFamily="var(--font-titulo)"
        fontSize="34"
        letterSpacing="10"
        fill="currentColor"
      >
        MANLY
      </text>
      <line x1="60" y1="64" x2="180" y2="64" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}
