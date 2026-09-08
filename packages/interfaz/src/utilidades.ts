// Utilidades compartidas por los componentes de interfaz.
import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind-merge no conoce los tokens propios de la marca: sin esta extensión
// clasifica `text-nota` como color y lo descarta al encontrar `text-grafito`,
// dejando el texto en el tamaño heredado. Cada token nuevo de --text-* o
// --color-* tiene que sumarse acá.
const TAMANIOS_TEXTO = ['nota', 'menor', 'base', 'guia', 'subtitulo', 'titulo', 'portada'] as const;

const COLORES_MARCA = [
  'tinta',
  'carbon',
  'grafito',
  'humo',
  'borde',
  'niebla',
  'lino',
  'papel',
  'exito',
  'atencion',
  'error',
] as const;

const fusionar = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: [...TAMANIOS_TEXTO] }],
      'text-color': [{ text: [...COLORES_MARCA] }],
      'bg-color': [{ bg: [...COLORES_MARCA] }],
      'border-color': [{ border: [...COLORES_MARCA] }],
    },
  },
});

/** Combina clases de Tailwind resolviendo los conflictos de la última que gana. */
export function cn(...clases: ClassValue[]): string {
  return fusionar(clsx(clases));
}
