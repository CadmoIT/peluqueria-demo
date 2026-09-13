// Envoltorio de next/image que consume el catálogo tipado.
// Garantiza que toda imagen del sitio tenga alt, dimensiones y respaldo.
import NextImage from 'next/image';

import { cn } from '@manly/interfaz';

import { obtenerImagen, type ImagenCatalogo } from '@/utilidades/imagenes';

/**
 * Calidad de recompresion.
 *
 * El valor por omision de Next es 75. Medido sobre estas fotografias, bajar a
 * 70 recorta un 15 % el peso que baja un telefono (127 a 108 KB el total de la
 * portada) con una diferencia media de 1,5 a 2,6 sobre 255 por canal: por
 * debajo de lo que se distingue mirando.
 *
 * No se baja mas. A 65 el ahorro extra son 11 KB y los artefactos en el pelo
 * casi se duplican, y el pelo es justamente lo que este negocio vende.
 */
const CALIDAD = 70;

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
      quality={CALIDAD}
      sizes={sizes ?? '100vw'}
      className={cn('h-full w-full object-cover', className)}
    />
  );
}
