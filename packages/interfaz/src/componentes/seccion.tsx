// Sección con el ritmo vertical del sistema y un fondo opcional.
// Mantiene constante la respiración entre bloques en todo el sitio.
import type { ReactNode } from 'react';

import { cn } from '../utilidades';

interface Propiedades {
  /** Fondo de la sección. `invertido` es el negro pleno de la marca. */
  fondo?: 'lino' | 'niebla' | 'invertido';
  /** Identificador para enlaces ancla. */
  id?: string;
  className?: string;
  children: ReactNode;
}

const FONDOS = {
  lino: 'bg-lino text-tinta',
  niebla: 'bg-niebla text-tinta',
  invertido: 'bg-tinta text-lino',
} as const;

export function Seccion({ fondo = 'lino', id, className, children }: Propiedades) {
  return (
    <section id={id} className={cn('py-seccion', FONDOS[fondo], className)}>
      {children}
    </section>
  );
}
