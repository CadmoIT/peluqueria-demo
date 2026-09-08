// Utilidades compartidas por los componentes de interfaz.
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Combina clases de Tailwind resolviendo los conflictos de la última que gana. */
export function cn(...clases: ClassValue[]): string {
  return twMerge(clsx(clases));
}
