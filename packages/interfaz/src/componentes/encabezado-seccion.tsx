// Encabezado de sección: etiqueta en versales, título y bajada opcional.
// Unifica cómo se presenta cada bloque del sitio.
import type { ReactNode } from 'react';

import { cn } from '../utilidades';

interface Propiedades {
  /** Etiqueta breve en versales sobre el título. */
  etiqueta?: string;
  titulo: ReactNode;
  /** Texto de apoyo bajo el título. */
  bajada?: ReactNode;
  /** Nivel semántico del encabezado. La portada usa 1; el resto, 2. */
  nivel?: 1 | 2 | 3;
  centrado?: boolean;
  className?: string;
}

export function EncabezadoSeccion({
  etiqueta,
  titulo,
  bajada,
  nivel = 2,
  centrado,
  className,
}: Propiedades) {
  const Titulo = `h${nivel}` as const;

  return (
    <div className={cn('flex flex-col gap-3', centrado && 'items-center text-center', className)}>
      {etiqueta ? <p className="versales text-nota text-grafito">{etiqueta}</p> : null}

      <Titulo className={nivel === 1 ? 'text-portada' : 'text-titulo'}>{titulo}</Titulo>

      {bajada ? (
        <p className={cn('text-guia text-grafito max-w-lectura', centrado && 'mx-auto')}>
          {bajada}
        </p>
      ) : null}
    </div>
  );
}
