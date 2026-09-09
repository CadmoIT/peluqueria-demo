// Envoltorio de cada paso del flujo: número, título y contenido.
import type { ReactNode } from 'react';

import { cn } from '@manly/interfaz';

interface Propiedades {
  numero: number;
  titulo: string;
  /** Un paso deshabilitado se ve pero no se puede completar todavía. */
  habilitado?: boolean;
  children: ReactNode;
}

export function Paso({ numero, titulo, habilitado = true, children }: Propiedades) {
  return (
    <section
      aria-labelledby={`paso-${String(numero)}`}
      className={cn('border-borde border-t py-8', !habilitado && 'opacity-40')}
    >
      <h2 id={`paso-${String(numero)}`} className="versales text-nota text-grafito mb-5">
        <span className="text-tinta">{numero}.</span> {titulo}
      </h2>

      {children}
    </section>
  );
}
