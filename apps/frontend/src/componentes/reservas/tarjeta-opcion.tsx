// Botón de un horario disponible.
'use client';

import { cn } from '@manly/interfaz';

import { formatearHora } from '@/utilidades/formato';

interface Propiedades {
  comienzaEn: string;
  seleccionado: boolean;
  onElegir: () => void;
}

export function TarjetaOpcion({ comienzaEn, seleccionado, onElegir }: Propiedades) {
  return (
    <button
      type="button"
      onClick={onElegir}
      aria-pressed={seleccionado}
      className={cn(
        'rounded-manly text-menor min-h-11 border px-4 transition-colors',
        'duration-(--duracion-rapida)',
        seleccionado
          ? 'bg-tinta text-lino border-tinta'
          : 'border-borde bg-papel hover:border-tinta',
      )}
    >
      {formatearHora(comienzaEn)}
    </button>
  );
}
