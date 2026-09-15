// Botón y enlace-botón de la marca. Es el único lugar donde se definen las
// variantes de acción: cualquier llamada a la acción del sitio sale de acá.
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '../utilidades';

// Las variantes «claras» son las mismas dos de siempre pero pensadas para las
// franjas de fondo negro —la portada, la cita, el cierre—, donde la sólida
// normal desaparecería contra el fondo. Existen acá y no escritas a mano en la
// página porque son el mismo botón en otro contexto, no otro botón.
export type VarianteBoton = 'solido' | 'contorno' | 'texto' | 'solido-claro' | 'contorno-claro';
export type TamanioBoton = 'normal' | 'grande';

const BASE = [
  'versales inline-flex items-center justify-center gap-2',
  'text-menor whitespace-nowrap',
  'rounded-manly border transition-colors',
  'duration-(--duracion-rapida) ease-manly',
  // Área táctil mínima de 44 px: requisito WCAG 2.2 AA para objetivos de puntero.
  'min-h-11',
  'disabled:pointer-events-none disabled:opacity-45',
].join(' ');

const VARIANTES: Record<VarianteBoton, string> = {
  solido: 'bg-tinta text-lino border-tinta hover:bg-carbon hover:border-carbon',
  contorno: 'bg-transparent text-tinta border-tinta hover:bg-tinta hover:text-lino',
  texto:
    'bg-transparent text-tinta border-transparent hover:text-grafito underline-offset-4 hover:underline',
  'solido-claro': 'bg-lino text-tinta border-lino hover:bg-white hover:border-white',
  'contorno-claro': 'bg-transparent text-lino border-lino hover:bg-lino hover:text-tinta',
};

const TAMANIOS: Record<TamanioBoton, string> = {
  normal: 'px-5 py-3',
  grande: 'px-8 py-4 text-base',
};

interface PropiedadesComunes {
  variante?: VarianteBoton;
  tamanio?: TamanioBoton;
  className?: string;
  children: ReactNode;
}

export function clasesBoton({
  variante = 'solido',
  tamanio = 'normal',
  className,
}: Omit<PropiedadesComunes, 'children'> = {}): string {
  return cn(BASE, VARIANTES[variante], TAMANIOS[tamanio], className);
}

export type PropiedadesBoton = PropiedadesComunes &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'>;

export function Boton({ variante, tamanio, className, children, ...resto }: PropiedadesBoton) {
  return (
    <button className={clasesBoton({ variante, tamanio, className })} {...resto}>
      {children}
    </button>
  );
}

export type PropiedadesEnlaceBoton = PropiedadesComunes &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'children'>;

/** Un enlace que se ve como botón. Se usa cuando la acción navega a otra página. */
export function EnlaceBoton({
  variante,
  tamanio,
  className,
  children,
  ...resto
}: PropiedadesEnlaceBoton) {
  return (
    <a className={clasesBoton({ variante, tamanio, className })} {...resto}>
      {children}
    </a>
  );
}
