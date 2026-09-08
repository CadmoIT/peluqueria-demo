// Caja de ancho máximo con los márgenes laterales del sistema.
// Todo bloque de contenido pasa por acá para que el sitio no tenga dos anchos.
import type { ElementType, ReactNode } from 'react';

import { cn } from '../utilidades';

interface Propiedades {
  /** Etiqueta a renderizar. Por defecto `div`; usar `header`, `nav`, etc. */
  como?: ElementType;
  /** Limita el ancho al de lectura cómoda en vez del ancho de contenido. */
  lectura?: boolean;
  className?: string;
  children: ReactNode;
}

export function Contenedor({ como: Etiqueta = 'div', lectura, className, children }: Propiedades) {
  return (
    <Etiqueta
      className={cn(
        'mx-auto w-full px-5 sm:px-8',
        lectura ? 'max-w-lectura' : 'max-w-contenido',
        className,
      )}
    >
      {children}
    </Etiqueta>
  );
}
