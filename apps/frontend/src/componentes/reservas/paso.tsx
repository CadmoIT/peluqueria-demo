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
      // Un paso pendiente **no se atenúa**. Antes llevaba `opacity-40`, que
      // dejaba su texto en 1.92:1 contra el fondo: ilegible, y justamente el
      // texto de un paso pendiente es la instrucción que dice cómo llegar a él
      // («Elegí primero una sucursal»). Esconder eso es esconder la salida.
      //
      // La excepción de WCAG para elementos inactivos cubre controles
      // deshabilitados, no encabezados ni instrucciones. Acá no hay controles:
      // un paso pendiente sólo muestra la instrucción, así que no hay nada que
      // atenuar. La jerarquía la da el borde superior y el texto en gris.
      className={cn('border-borde border-t py-8', !habilitado && 'border-dashed')}
    >
      <h2 id={`paso-${String(numero)}`} className="versales text-nota text-grafito mb-5">
        <span className="text-tinta">{numero}.</span> {titulo}
      </h2>

      {children}
    </section>
  );
}
