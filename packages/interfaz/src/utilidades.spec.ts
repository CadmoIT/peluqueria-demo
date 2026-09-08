// Protege la configuración de tailwind-merge.
//
// Sin la extensión con los tokens de la marca, tailwind-merge clasifica
// `text-nota` como un color y lo descarta al encontrar `text-grafito`: el texto
// queda en el tamaño heredado y el error es invisible hasta que se mide en el
// navegador. Cada token nuevo de --text-* o --color-* debe sumarse acá y a
// utilidades.ts.
import { describe, expect, it } from 'vitest';

import { cn } from './utilidades';

describe('cn', () => {
  it('conserva el tamaño de texto junto con el color', () => {
    const clases = cn('text-nota', 'text-grafito');

    expect(clases).toContain('text-nota');
    expect(clases).toContain('text-grafito');
  });

  it.each(['nota', 'menor', 'base', 'guia', 'subtitulo', 'titulo', 'portada'])(
    'conserva text-%s frente a un color de marca',
    (tamanio) => {
      expect(cn(`text-${tamanio}`, 'text-tinta')).toContain(`text-${tamanio}`);
    },
  );

  it('sigue resolviendo el conflicto entre dos colores de texto', () => {
    const clases = cn('text-grafito', 'text-tinta');

    expect(clases).toBe('text-tinta');
  });

  it('sigue resolviendo el conflicto entre dos tamaños de texto', () => {
    expect(cn('text-nota', 'text-titulo')).toBe('text-titulo');
  });

  it('resuelve el conflicto entre colores de fondo de marca', () => {
    expect(cn('bg-lino', 'bg-tinta')).toBe('bg-tinta');
  });

  it('descarta las clases condicionales falsas', () => {
    const hayError = false;

    expect(cn('text-tinta', hayError && 'text-error', undefined)).toBe('text-tinta');
  });
});
