// Envoltorio de next/image que consume el catálogo tipado.
// Garantiza que toda imagen del sitio tenga alt, dimensiones y respaldo.
import NextImage from 'next/image';

import { cn } from '@manly/interfaz';

import { obtenerImagen, type ImagenCatalogo } from '@/utilidades/imagenes';

interface Propiedades {
  imagen: ImagenCatalogo;
  /** Marca la imagen como prioritaria: sólo para la portada visible al cargar. */
  prioritaria?: boolean;
  /** Pista de tamaños para que el navegador elija la resolución adecuada. */
  sizes?: string;
  className?: string;
}

export function Imagen({ imagen, prioritaria, sizes, className }: Propiedades) {
  const elegida = obtenerImagen(imagen);

  return (
    <NextImage
      src={elegida.ruta}
      alt={elegida.alt}
      width={elegida.ancho}
      height={elegida.alto}
      priority={prioritaria}
      sizes={sizes ?? '100vw'}
      className={cn('h-full w-full object-cover', className)}
    />
  );
}
