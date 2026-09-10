// Contraste de los tokens de color, medido y fijado.
//
// Existe porque el problema que arregla es invisible: un gris apenas más claro
// se ve bien en la pantalla de quien lo elige y deja el texto ilegible para
// quien tiene poca visión o mira el teléfono al sol. Nadie lo nota revisando un
// diseño; se nota cuando alguien no puede usar el sitio.
//
// El caso concreto: `humo` estuvo en `oklch(0.66)` desde la fase 2 y daba 2.98:1
// sobre el fondo base. Se usó para texto secundario en todo el panel. Ninguna
// revisión visual lo detectó.
//
// Los números salen de la fórmula de WCAG 2.x sobre los valores convertidos a
// sRGB. Si un token cambia, esta prueba dice exactamente cuánto se perdió.
import { describe, expect, it } from 'vitest';

/** Umbrales de WCAG 2.2 nivel AA. */
const TEXTO_NORMAL = 4.5;
const TEXTO_GRANDE = 3;
const COMPONENTE = 3;

/**
 * Los tokens, ya convertidos a sRGB.
 *
 * Se anotan a mano en vez de convertir oklch en la prueba: una conversión propia
 * podría tener el mismo error que el código que verifica, y acá lo que importa
 * es qué píxel termina pintando el navegador. Los valores se midieron leyendo
 * un lienzo con el color aplicado, que es lo que el navegador resuelve de
 * verdad.
 */
const TOKENS = {
  tinta: [9, 9, 9],
  carbon: [58, 58, 58],
  grafito: [82, 82, 82],
  humo: [108, 108, 108],
  ceniza: [177, 177, 177],
  bordeCampo: [140, 140, 140],
  borde: [219, 219, 219],
  niebla: [242, 242, 242],
  lino: [250, 250, 249],
  papel: [255, 255, 255],

  // Estados, y el fondo teñido al 10 % sobre el que se dibujan.
  error: [187, 9, 22],
  errorTenue: [247, 233, 232],
  exito: [0, 110, 59],
  exitoTenue: [232, 242, 237],
  atencion: [141, 85, 0],
  atencionTenue: [245, 240, 233],
} as const satisfies Record<string, readonly [number, number, number]>;

type Color = readonly [number, number, number];

function luminancia([r, g, b]: Color): number {
  const canal = (valor: number) => {
    const normalizado = valor / 255;

    return normalizado <= 0.03928
      ? normalizado / 12.92
      : Math.pow((normalizado + 0.055) / 1.055, 2.4);
  };

  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/** Contraste entre dos colores, según WCAG 2.x. */
export function contraste(uno: Color, otro: Color): number {
  const luminancias = [luminancia(uno), luminancia(otro)];
  const mayor = Math.max(...luminancias);
  const menor = Math.min(...luminancias);

  return (mayor + 0.05) / (menor + 0.05);
}

/** Los tres fondos claros sobre los que se dibuja texto. */
const FONDOS_CLAROS = [
  ['lino', TOKENS.lino],
  ['papel', TOKENS.papel],
  ['niebla', TOKENS.niebla],
] as const;

describe('texto sobre fondo claro', () => {
  for (const [nombre, tono] of [
    ['tinta', TOKENS.tinta],
    ['grafito', TOKENS.grafito],
    ['humo', TOKENS.humo],
  ] as const) {
    for (const [fondo, color] of FONDOS_CLAROS) {
      it(`${nombre} sobre ${fondo} llega a AA`, () => {
        expect(contraste(tono, color)).toBeGreaterThanOrEqual(TEXTO_NORMAL);
      });
    }
  }
});

describe('texto sobre fondo oscuro', () => {
  // El pie de página y la portada son negros. `humo` ahí no sirve —da 3.79:1—,
  // y por eso existe `ceniza`.
  it('ceniza sobre tinta llega a AA', () => {
    expect(contraste(TOKENS.ceniza, TOKENS.tinta)).toBeGreaterThanOrEqual(TEXTO_NORMAL);
  });

  it('lino sobre tinta llega a AA', () => {
    expect(contraste(TOKENS.lino, TOKENS.tinta)).toBeGreaterThanOrEqual(TEXTO_NORMAL);
  });

  it('humo NO sirve sobre oscuro, y por eso ceniza existe', () => {
    expect(contraste(TOKENS.humo, TOKENS.tinta)).toBeLessThan(TEXTO_NORMAL);
  });
});

describe('bordes de control', () => {
  // WCAG 2.2 SC 1.4.11: el contorno que identifica un control necesita 3:1.
  // El de un campo de formulario es lo único que lo distingue del fondo.
  for (const [fondo, color] of FONDOS_CLAROS) {
    it(`borde-campo sobre ${fondo} llega a 3:1`, () => {
      expect(contraste(TOKENS.bordeCampo, color)).toBeGreaterThanOrEqual(COMPONENTE);
    });
  }

  it('borde decorativo no pretende llegar: separa, no identifica', () => {
    // Se deja fijado para que nadie lo use como borde de campo por descuido.
    expect(contraste(TOKENS.borde, TOKENS.papel)).toBeLessThan(COMPONENTE);
  });
});

describe('superficies invertidas', () => {
  it('lino sobre carbón llega a AA', () => {
    expect(contraste(TOKENS.lino, TOKENS.carbon)).toBeGreaterThanOrEqual(TEXTO_NORMAL);
  });

  it('los títulos grandes en blanco sobre tinta pasan de sobra', () => {
    expect(contraste(TOKENS.papel, TOKENS.tinta)).toBeGreaterThanOrEqual(TEXTO_GRANDE);
  });
});

describe('colores de estado', () => {
  // Cada uno se usa de dos formas a la vez: como texto sobre su propio fondo
  // teñido y como relleno con texto claro encima. Las dos tienen que llegar.
  //
  // La primera versión de estos tonos daba 4.41, 4.02 y 2.68 como texto. El
  // aviso de error del panel quedaba por debajo del umbral y el de atención era
  // directamente ilegible, y los dos aparecen justo cuando algo salió mal: son
  // los que más importa poder leer.
  for (const [nombre, texto, fondo] of [
    ['error', TOKENS.error, TOKENS.errorTenue],
    ['éxito', TOKENS.exito, TOKENS.exitoTenue],
    ['atención', TOKENS.atencion, TOKENS.atencionTenue],
  ] as const) {
    it(`${nombre} se lee sobre su propio fondo`, () => {
      expect(contraste(texto, fondo)).toBeGreaterThanOrEqual(TEXTO_NORMAL);
    });

    it(`${nombre} se lee como relleno con texto claro`, () => {
      expect(contraste(TOKENS.lino, texto)).toBeGreaterThanOrEqual(TEXTO_NORMAL);
    });
  }
});
