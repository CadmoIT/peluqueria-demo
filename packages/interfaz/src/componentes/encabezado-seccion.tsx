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
  /**
   * Invierte los grises tenues para las franjas de fondo negro.
   *
   * No es un capricho de gusto: `grafito` sobre `tinta` da 2,3:1 y no se lee.
   * El gris que funciona sobre oscuro es `ceniza`, que sobre claro sería
   * ilegible. Ver la tabla de `tokens.css`.
   */
  sobreOscuro?: boolean;
  centrado?: boolean;
  className?: string;
}

export function EncabezadoSeccion({
  etiqueta,
  titulo,
  bajada,
  nivel = 2,
  sobreOscuro,
  centrado,
  className,
}: Propiedades) {
  const Titulo = `h${nivel}` as const;
  const tenue = sobreOscuro ? 'text-ceniza' : 'text-grafito';

  return (
    // La etiqueta va pegada al título —8 px— para que se lean como una sola
    // unidad y no como dos líneas sueltas; la bajada respira un poco más
    // porque ya es otro nivel de lectura.
    <div className={cn('flex flex-col gap-2', centrado && 'items-center text-center', className)}>
      {etiqueta ? <p className={cn('versales text-nota', tenue)}>{etiqueta}</p> : null}

      <Titulo className={nivel === 1 ? 'text-portada' : 'text-titulo'}>{titulo}</Titulo>

      {bajada ? (
        <p className={cn('text-guia max-w-lectura mt-1', tenue, centrado && 'mx-auto')}>{bajada}</p>
      ) : null}
    </div>
  );
}
