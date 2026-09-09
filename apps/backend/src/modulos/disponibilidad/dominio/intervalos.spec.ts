// Pruebas del álgebra de intervalos.
//
// Es la base de todo el motor: si `restar` o `unir` se equivocan, el motor
// ofrece horarios que no existen. Además de casos concretos hay pruebas de
// propiedad, que buscan contraejemplos en vez de confiar en los ejemplos que
// se nos ocurrieron.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  algunoContiene,
  contiene,
  instantesCandidatos,
  intersectar,
  restar,
  solapan,
  unir,
  type Intervalo,
} from './intervalos';

const MINUTO = 60_000;

/** Genera intervalos válidos y chicos, para que los contraejemplos se lean. */
const generadorIntervalo = fc
  .tuple(fc.integer({ min: 0, max: 500 }), fc.integer({ min: 1, max: 100 }))
  .map(([desde, largo]): Intervalo => ({ desde, hasta: desde + largo }));

const generadorLista = fc.array(generadorIntervalo, { maxLength: 8 });

/** Instantes cubiertos por una lista, como conjunto, para comparar sin ambigüedad. */
function instantesCubiertos(intervalos: Intervalo[]): Set<number> {
  const cubiertos = new Set<number>();

  for (const intervalo of intervalos) {
    for (let punto = intervalo.desde; punto < intervalo.hasta; punto += 1) {
      cubiertos.add(punto);
    }
  }

  return cubiertos;
}

describe('solapan', () => {
  it('dos intervalos que comparten tiempo se solapan', () => {
    expect(solapan({ desde: 0, hasta: 10 }, { desde: 5, hasta: 15 })).toBe(true);
  });

  it('el que termina donde empieza el otro no se solapa', () => {
    expect(solapan({ desde: 0, hasta: 10 }, { desde: 10, hasta: 20 })).toBe(false);
  });

  it('es simétrico', () => {
    fc.assert(
      fc.property(generadorIntervalo, generadorIntervalo, (a, b) => {
        expect(solapan(a, b)).toBe(solapan(b, a));
      }),
    );
  });
});

describe('unir', () => {
  it('junta intervalos que se tocan', () => {
    expect(
      unir([
        { desde: 0, hasta: 10 },
        { desde: 10, hasta: 20 },
      ]),
    ).toEqual([{ desde: 0, hasta: 20 }]);
  });

  it('junta intervalos que se solapan', () => {
    expect(
      unir([
        { desde: 0, hasta: 15 },
        { desde: 10, hasta: 20 },
      ]),
    ).toEqual([{ desde: 0, hasta: 20 }]);
  });

  it('deja separados los que no se tocan', () => {
    expect(
      unir([
        { desde: 0, hasta: 10 },
        { desde: 20, hasta: 30 },
      ]),
    ).toEqual([
      { desde: 0, hasta: 10 },
      { desde: 20, hasta: 30 },
    ]);
  });

  it('el resultado nunca tiene dos intervalos que se solapen', () => {
    fc.assert(
      fc.property(generadorLista, (lista) => {
        const unidos = unir(lista);

        for (let i = 0; i < unidos.length - 1; i += 1) {
          expect(unidos[i]!.hasta).toBeLessThan(unidos[i + 1]!.desde);
        }
      }),
    );
  });

  it('conserva exactamente los mismos instantes', () => {
    fc.assert(
      fc.property(generadorLista, (lista) => {
        expect(instantesCubiertos(unir(lista))).toEqual(instantesCubiertos(lista));
      }),
    );
  });
});

describe('restar', () => {
  it('parte un intervalo en dos cuando el hueco cae en el medio', () => {
    expect(restar([{ desde: 0, hasta: 100 }], [{ desde: 40, hasta: 60 }])).toEqual([
      { desde: 0, hasta: 40 },
      { desde: 60, hasta: 100 },
    ]);
  });

  it('recorta el borde cuando el hueco se pasa de largo', () => {
    expect(restar([{ desde: 0, hasta: 100 }], [{ desde: 80, hasta: 200 }])).toEqual([
      { desde: 0, hasta: 80 },
    ]);
  });

  it('elimina el intervalo cuando queda tapado por completo', () => {
    expect(restar([{ desde: 10, hasta: 20 }], [{ desde: 0, hasta: 100 }])).toEqual([]);
  });

  it('no cambia nada si el hueco no toca', () => {
    expect(restar([{ desde: 0, hasta: 10 }], [{ desde: 50, hasta: 60 }])).toEqual([
      { desde: 0, hasta: 10 },
    ]);
  });

  it('lo que queda nunca toca lo que se quitó', () => {
    fc.assert(
      fc.property(generadorLista, generadorLista, (base, aQuitar) => {
        const restante = restar(base, aQuitar);

        for (const trozo of restante) {
          for (const hueco of aQuitar) {
            expect(solapan(trozo, hueco)).toBe(false);
          }
        }
      }),
    );
  });

  it('lo que queda estaba en la base', () => {
    fc.assert(
      fc.property(generadorLista, generadorLista, (base, aQuitar) => {
        const cubiertosBase = instantesCubiertos(base);

        for (const punto of instantesCubiertos(restar(base, aQuitar))) {
          expect(cubiertosBase.has(punto)).toBe(true);
        }
      }),
    );
  });

  it('restar y volver a sumar el hueco recupera la base', () => {
    fc.assert(
      fc.property(generadorLista, generadorLista, (base, aQuitar) => {
        const recuperado = instantesCubiertos([...restar(base, aQuitar), ...aQuitar]);
        const esperado = instantesCubiertos([...base, ...aQuitar]);

        expect(recuperado).toEqual(esperado);
      }),
    );
  });
});

describe('intersectar', () => {
  it('devuelve sólo la parte común', () => {
    expect(intersectar([{ desde: 0, hasta: 100 }], [{ desde: 50, hasta: 150 }])).toEqual([
      { desde: 50, hasta: 100 },
    ]);
  });

  it('es la intersección de los instantes de ambas listas', () => {
    fc.assert(
      fc.property(generadorLista, generadorLista, (a, b) => {
        const cubiertosA = instantesCubiertos(a);
        const cubiertosB = instantesCubiertos(b);
        const esperado = new Set([...cubiertosA].filter((punto) => cubiertosB.has(punto)));

        expect(instantesCubiertos(intersectar(a, b))).toEqual(esperado);
      }),
    );
  });
});

describe('algunoContiene', () => {
  it('reconoce una ventana que entra entera en una franja', () => {
    expect(algunoContiene([{ desde: 0, hasta: 100 }], { desde: 10, hasta: 20 })).toBe(true);
  });

  it('rechaza una ventana que se sale de la franja', () => {
    expect(algunoContiene([{ desde: 0, hasta: 100 }], { desde: 90, hasta: 110 })).toBe(false);
  });

  it('rechaza una ventana que necesita dos franjas separadas', () => {
    const franjas = [
      { desde: 0, hasta: 50 },
      { desde: 60, hasta: 100 },
    ];

    expect(algunoContiene(franjas, { desde: 40, hasta: 70 })).toBe(false);
  });

  it('acepta una ventana que cruza dos franjas contiguas, porque se unen', () => {
    const franjas = [
      { desde: 0, hasta: 50 },
      { desde: 50, hasta: 100 },
    ];

    expect(algunoContiene(franjas, { desde: 40, hasta: 70 })).toBe(true);
  });
});

describe('instantesCandidatos', () => {
  it('alinea los horarios a la grilla, no al horario de apertura', () => {
    // La franja abre 10:07; el primer horario ofrecido debe ser 10:15.
    const desde = Date.UTC(2026, 9, 1, 10, 7);
    const hasta = Date.UTC(2026, 9, 1, 12, 0);

    const candidatos = instantesCandidatos([{ desde, hasta }], 15, 60);

    expect(new Date(candidatos[0]!).toISOString()).toBe('2026-10-01T10:15:00.000Z');
  });

  it('no ofrece horarios en los que el servicio no llega a terminar', () => {
    const desde = Date.UTC(2026, 9, 1, 10, 0);
    const hasta = Date.UTC(2026, 9, 1, 11, 0);

    const candidatos = instantesCandidatos([{ desde, hasta }], 15, 60);

    expect(candidatos).toHaveLength(1);
    expect(candidatos[0]).toBe(desde);
  });

  it('devuelve vacío si la franja es más corta que el servicio', () => {
    const desde = Date.UTC(2026, 9, 1, 10, 0);

    expect(instantesCandidatos([{ desde, hasta: desde + 30 * MINUTO }], 15, 60)).toEqual([]);
  });

  it('todo candidato deja entrar el servicio completo dentro de una franja', () => {
    fc.assert(
      fc.property(generadorLista, fc.integer({ min: 1, max: 30 }), (franjas, duracion) => {
        const unidas = unir(franjas);

        for (const candidato of instantesCandidatos(franjas, 1, duracion / 60_000)) {
          const ventana = { desde: candidato, hasta: candidato + duracion };
          expect(unidas.some((franja) => contiene(franja, ventana))).toBe(true);
        }
      }),
    );
  });
});
