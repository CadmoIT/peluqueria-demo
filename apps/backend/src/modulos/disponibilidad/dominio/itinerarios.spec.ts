// Pruebas del motor de itinerarios.
//
// Además de los casos concretos hay pruebas de propiedad sobre escenarios
// generados al azar, que verifican las tres invariantes que el plan exige:
// ningún itinerario puede solaparse, salir del horario laboral ni perder un
// servicio.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { solapan, type Intervalo } from './intervalos';
import {
  generarItinerarios,
  type Itinerario,
  type ParametrosItinerarios,
  type ServicioSolicitado,
} from './itinerarios';

const MINUTO = 60_000;
const ANA = 'ana';
const BETO = 'beto';

/** Jornada de 10 a 20 hora local de Buenos Aires, en UTC. */
const JORNADA: Intervalo = {
  desde: Date.UTC(2026, 9, 1, 13, 0),
  hasta: Date.UTC(2026, 9, 1, 23, 0),
};

function servicio(parcial: Partial<ServicioSolicitado> = {}): ServicioSolicitado {
  return {
    servicioId: 'corte',
    nombre: 'Corte',
    duracionMinutos: 60,
    minutosPreparacion: 0,
    minutosLimpieza: 0,
    precioCentavos: 1_500_000,
    seniaCentavos: 0,
    profesionalPreferidoId: null,
    profesionalesCompatibles: [ANA],
    ...parcial,
  };
}

function buscar(parcial: Partial<ParametrosItinerarios> = {}) {
  return generarItinerarios({
    servicios: [servicio()],
    franjasPorProfesional: new Map([[ANA, [JORNADA]]]),
    ocupadoPorProfesional: new Map(),
    rango: JORNADA,
    pasoMinutos: 30,
    maximoOpciones: 100,
    permitirReordenar: true,
    ...parcial,
  });
}

/** Hora UTC legible, para que los fallos se entiendan de un vistazo. */
function hora(instante: number): string {
  return new Date(instante).toISOString().slice(11, 16);
}

describe('un solo servicio', () => {
  it('ofrece horarios en toda la jornada', () => {
    const { itinerarios } = buscar();

    // De 13:00 a 22:00 cada 30 minutos: el último debe terminar 23:00.
    expect(itinerarios).toHaveLength(19);
    expect(hora(itinerarios[0]!.comienzaEn)).toBe('13:00');
    expect(hora(itinerarios[itinerarios.length - 1]!.terminaEn)).toBe('23:00');
  });

  it('no ofrece nada si el profesional no trabaja', () => {
    const { itinerarios } = buscar({ franjasPorProfesional: new Map([[ANA, []]]) });

    expect(itinerarios).toEqual([]);
  });

  it('no ofrece nada si el servicio no tiene profesional compatible', () => {
    const { itinerarios } = buscar({
      servicios: [servicio({ profesionalesCompatibles: [] })],
    });

    expect(itinerarios).toEqual([]);
  });

  it('respeta el tope de opciones e informa que hay más', () => {
    const resultado = buscar({ maximoOpciones: 5 });

    expect(resultado.itinerarios).toHaveLength(5);
    expect(resultado.hayMas).toBe(true);
  });
});

describe('preferencia de profesional', () => {
  const dosProfesionales = new Map([
    [ANA, [JORNADA]],
    [BETO, [JORNADA]],
  ]);

  it('asigna sólo al profesional pedido', () => {
    const { itinerarios } = buscar({
      servicios: [
        servicio({ profesionalPreferidoId: BETO, profesionalesCompatibles: [ANA, BETO] }),
      ],
      franjasPorProfesional: dosProfesionales,
    });

    expect(itinerarios.length).toBeGreaterThan(0);
    expect(itinerarios.every((opcion) => opcion.bloques[0]!.profesionalId === BETO)).toBe(true);
  });

  it('no ofrece otro profesional si el pedido está ocupado', () => {
    const { itinerarios } = buscar({
      servicios: [
        servicio({ profesionalPreferidoId: BETO, profesionalesCompatibles: [ANA, BETO] }),
      ],
      franjasPorProfesional: dosProfesionales,
      ocupadoPorProfesional: new Map([[BETO, [JORNADA]]]),
    });

    expect(itinerarios).toEqual([]);
  });

  it('no ofrece nada si el profesional pedido no presta ese servicio', () => {
    const { itinerarios } = buscar({
      servicios: [servicio({ profesionalPreferidoId: BETO, profesionalesCompatibles: [ANA] })],
      franjasPorProfesional: dosProfesionales,
    });

    expect(itinerarios).toEqual([]);
  });

  it('con "cualquiera" usa al que esté libre', () => {
    const { itinerarios } = buscar({
      servicios: [servicio({ profesionalesCompatibles: [ANA, BETO] })],
      franjasPorProfesional: dosProfesionales,
      ocupadoPorProfesional: new Map([[ANA, [JORNADA]]]),
    });

    expect(itinerarios.length).toBeGreaterThan(0);
    expect(itinerarios.every((opcion) => opcion.bloques[0]!.profesionalId === BETO)).toBe(true);
  });
});

describe('varios servicios', () => {
  const corte = servicio({ servicioId: 'corte', nombre: 'Corte', duracionMinutos: 45 });
  const barba = servicio({
    servicioId: 'barba',
    nombre: 'Barba',
    duracionMinutos: 30,
    profesionalesCompatibles: [ANA],
  });

  it('encadena los bloques sin tiempos muertos', () => {
    const { itinerarios } = buscar({ servicios: [corte, barba] });

    const primero = itinerarios[0]!;

    expect(primero.bloques).toHaveLength(2);
    expect(primero.bloques[1]!.comienzaEn).toBe(primero.bloques[0]!.terminaEn);
    expect(primero.duracionTotalMinutos).toBe(75);
    expect(primero.terminaEn - primero.comienzaEn).toBe(75 * MINUTO);
  });

  it('suma los precios de todos los bloques', () => {
    const { itinerarios } = buscar({
      servicios: [corte, servicio({ ...barba, precioCentavos: 900_000, seniaCentavos: 270_000 })],
    });

    expect(itinerarios[0]!.precioTotalCentavos).toBe(1_500_000 + 900_000);
    expect(itinerarios[0]!.seniaTotalCentavos).toBe(270_000);
  });

  it('reparte los servicios entre profesionales distintos cuando hace falta', () => {
    const soloAna = servicio({ servicioId: 'corte', profesionalesCompatibles: [ANA] });
    const soloBeto = servicio({
      servicioId: 'color',
      nombre: 'Color',
      duracionMinutos: 30,
      profesionalesCompatibles: [BETO],
    });

    const { itinerarios } = buscar({
      servicios: [soloAna, soloBeto],
      franjasPorProfesional: new Map([
        [ANA, [JORNADA]],
        [BETO, [JORNADA]],
      ]),
    });

    const primero = itinerarios[0]!;

    expect(primero.bloques[0]!.profesionalId).toBe(ANA);
    expect(primero.bloques[1]!.profesionalId).toBe(BETO);
  });

  it('reordena los servicios cuando en el orden pedido no entran', () => {
    // Ana sólo puede a partir de las 14:00; Beto sólo hasta las 14:00.
    // El único encaje es Beto primero, o sea el orden invertido.
    const deAna = servicio({ servicioId: 'a', profesionalesCompatibles: [ANA] });
    const deBeto = servicio({ servicioId: 'b', profesionalesCompatibles: [BETO] });

    const parametros = {
      servicios: [deAna, deBeto],
      franjasPorProfesional: new Map([
        [ANA, [{ desde: Date.UTC(2026, 9, 1, 14, 0), hasta: JORNADA.hasta }]],
        [BETO, [{ desde: JORNADA.desde, hasta: Date.UTC(2026, 9, 1, 14, 0) }]],
      ]),
    };

    const conReorden = buscar({ ...parametros, permitirReordenar: true });
    const sinReorden = buscar({ ...parametros, permitirReordenar: false });

    expect(conReorden.itinerarios.length).toBeGreaterThan(0);
    expect(conReorden.itinerarios[0]!.bloques[0]!.servicioId).toBe('b');
    expect(sinReorden.itinerarios).toEqual([]);
  });
});

describe('tiempos de preparación y limpieza', () => {
  it('un mismo profesional no puede encadenar si la limpieza invade el siguiente', () => {
    const conLimpieza = servicio({
      servicioId: 'color',
      duracionMinutos: 60,
      minutosLimpieza: 15,
      profesionalesCompatibles: [ANA],
    });
    const despues = servicio({ servicioId: 'corte', profesionalesCompatibles: [ANA] });

    const { itinerarios } = buscar({
      servicios: [conLimpieza, despues],
      permitirReordenar: false,
    });

    expect(itinerarios).toEqual([]);
  });

  it('con dos profesionales sí se puede encadenar aunque haya limpieza', () => {
    const conLimpieza = servicio({
      servicioId: 'color',
      duracionMinutos: 60,
      minutosLimpieza: 15,
      profesionalesCompatibles: [ANA],
    });
    const despues = servicio({ servicioId: 'corte', profesionalesCompatibles: [BETO] });

    const { itinerarios } = buscar({
      servicios: [conLimpieza, despues],
      franjasPorProfesional: new Map([
        [ANA, [JORNADA]],
        [BETO, [JORNADA]],
      ]),
      permitirReordenar: false,
    });

    expect(itinerarios.length).toBeGreaterThan(0);
    expect(itinerarios[0]!.bloques[1]!.comienzaEn).toBe(itinerarios[0]!.bloques[0]!.terminaEn);
  });

  it('la preparación tiene que entrar dentro del horario de trabajo', () => {
    // El servicio dura 60 minutos y pide 30 de preparación previa: aunque la
    // jornada permita empezar 13:00, la preparación caería antes de abrir.
    const conPreparacion = servicio({ minutosPreparacion: 30 });

    const { itinerarios } = buscar({ servicios: [conPreparacion] });

    expect(hora(itinerarios[0]!.comienzaEn)).toBe('13:30');
  });
});

describe('agenda ya ocupada', () => {
  it('no ofrece horarios que pisen una reserva existente', () => {
    const ocupado = {
      desde: Date.UTC(2026, 9, 1, 15, 0),
      hasta: Date.UTC(2026, 9, 1, 17, 0),
    };

    const { itinerarios } = buscar({ ocupadoPorProfesional: new Map([[ANA, [ocupado]]]) });

    for (const opcion of itinerarios) {
      expect(solapan({ desde: opcion.comienzaEn, hasta: opcion.terminaEn }, ocupado)).toBe(false);
    }

    expect(itinerarios.length).toBeGreaterThan(0);
  });

  it('permite empezar justo cuando termina la reserva anterior', () => {
    const ocupado = {
      desde: Date.UTC(2026, 9, 1, 13, 0),
      hasta: Date.UTC(2026, 9, 1, 14, 0),
    };

    const { itinerarios } = buscar({ ocupadoPorProfesional: new Map([[ANA, [ocupado]]]) });

    expect(hora(itinerarios[0]!.comienzaEn)).toBe('14:00');
  });
});

describe('invariantes del motor', () => {
  // Escenarios al azar: franjas, ocupaciones y servicios variados. No se
  // comprueba qué devuelve, sino que lo que devuelva sea siempre válido.
  const escenario = fc
    .record({
      cantidadServicios: fc.integer({ min: 1, max: 3 }),
      duraciones: fc.array(fc.integer({ min: 15, max: 90 }), { minLength: 3, maxLength: 3 }),
      preparaciones: fc.array(fc.integer({ min: 0, max: 15 }), { minLength: 3, maxLength: 3 }),
      limpiezas: fc.array(fc.integer({ min: 0, max: 15 }), { minLength: 3, maxLength: 3 }),
      inicioJornadaAna: fc.integer({ min: 0, max: 120 }),
      largoJornadaAna: fc.integer({ min: 60, max: 600 }),
      inicioJornadaBeto: fc.integer({ min: 0, max: 120 }),
      largoJornadaBeto: fc.integer({ min: 60, max: 600 }),
      ocupaciones: fc.array(
        fc.tuple(fc.integer({ min: 0, max: 500 }), fc.integer({ min: 15, max: 120 })),
        { maxLength: 4 },
      ),
      permitirReordenar: fc.boolean(),
    })
    .map((datos) => {
      const base = JORNADA.desde;

      const franjaAna: Intervalo = {
        desde: base + datos.inicioJornadaAna * MINUTO,
        hasta: base + (datos.inicioJornadaAna + datos.largoJornadaAna) * MINUTO,
      };
      const franjaBeto: Intervalo = {
        desde: base + datos.inicioJornadaBeto * MINUTO,
        hasta: base + (datos.inicioJornadaBeto + datos.largoJornadaBeto) * MINUTO,
      };

      const servicios = Array.from({ length: datos.cantidadServicios }, (_, indice) =>
        servicio({
          servicioId: `s${String(indice)}`,
          nombre: `Servicio ${String(indice)}`,
          duracionMinutos: datos.duraciones[indice]!,
          minutosPreparacion: datos.preparaciones[indice]!,
          minutosLimpieza: datos.limpiezas[indice]!,
          profesionalesCompatibles: [ANA, BETO],
        }),
      );

      const ocupado = datos.ocupaciones.map(([desde, largo]) => ({
        desde: base + desde * MINUTO,
        hasta: base + (desde + largo) * MINUTO,
      }));

      const parametros: ParametrosItinerarios = {
        servicios,
        franjasPorProfesional: new Map([
          [ANA, [franjaAna]],
          [BETO, [franjaBeto]],
        ]),
        ocupadoPorProfesional: new Map([
          [ANA, ocupado],
          [BETO, ocupado],
        ]),
        rango: { desde: base, hasta: base + 12 * 60 * MINUTO },
        pasoMinutos: 15,
        maximoOpciones: 20,
        permitirReordenar: datos.permitirReordenar,
      };

      return { parametros, franjas: { [ANA]: franjaAna, [BETO]: franjaBeto }, ocupado };
    });

  it('los bloques son consecutivos y sin tiempos muertos', () => {
    fc.assert(
      fc.property(escenario, ({ parametros }) => {
        for (const opcion of generarItinerarios(parametros).itinerarios) {
          expect(opcion.bloques[0]!.comienzaEn).toBe(opcion.comienzaEn);

          for (let i = 0; i < opcion.bloques.length - 1; i += 1) {
            expect(opcion.bloques[i + 1]!.comienzaEn).toBe(opcion.bloques[i]!.terminaEn);
          }

          expect(opcion.bloques[opcion.bloques.length - 1]!.terminaEn).toBe(opcion.terminaEn);
        }
      }),
    );
  });

  it('ningún itinerario pierde ni repite un servicio', () => {
    fc.assert(
      fc.property(escenario, ({ parametros }) => {
        const pedidos = parametros.servicios.map((s) => s.servicioId).sort();

        for (const opcion of generarItinerarios(parametros).itinerarios) {
          expect(opcion.bloques.map((bloque) => bloque.servicioId).sort()).toEqual(pedidos);
        }
      }),
    );
  });

  it('todo bloque cae dentro del horario de trabajo de su profesional', () => {
    fc.assert(
      fc.property(escenario, ({ parametros, franjas }) => {
        for (const opcion of generarItinerarios(parametros).itinerarios) {
          for (const bloque of opcion.bloques) {
            const franja = franjas[bloque.profesionalId as typeof ANA | typeof BETO];

            // Se compara la ventana ocupada: la limpieza también es trabajo.
            expect(bloque.ocupaDesde).toBeGreaterThanOrEqual(franja.desde);
            expect(bloque.ocupaHasta).toBeLessThanOrEqual(franja.hasta);
          }
        }
      }),
    );
  });

  it('ningún bloque pisa la agenda ya ocupada', () => {
    fc.assert(
      fc.property(escenario, ({ parametros, ocupado }) => {
        for (const opcion of generarItinerarios(parametros).itinerarios) {
          for (const bloque of opcion.bloques) {
            const ventana = { desde: bloque.ocupaDesde, hasta: bloque.ocupaHasta };

            for (const ocupacion of ocupado) {
              expect(solapan(ventana, ocupacion)).toBe(false);
            }
          }
        }
      }),
    );
  });

  it('dos bloques del mismo profesional nunca se pisan entre sí', () => {
    fc.assert(
      fc.property(escenario, ({ parametros }) => {
        for (const opcion of generarItinerarios(parametros).itinerarios) {
          for (let i = 0; i < opcion.bloques.length; i += 1) {
            for (let j = i + 1; j < opcion.bloques.length; j += 1) {
              const uno = opcion.bloques[i]!;
              const otro = opcion.bloques[j]!;

              if (uno.profesionalId !== otro.profesionalId) continue;

              expect(
                solapan(
                  { desde: uno.ocupaDesde, hasta: uno.ocupaHasta },
                  { desde: otro.ocupaDesde, hasta: otro.ocupaHasta },
                ),
              ).toBe(false);
            }
          }
        }
      }),
    );
  });

  it('la duración total siempre es la suma de los servicios pedidos', () => {
    fc.assert(
      fc.property(escenario, ({ parametros }) => {
        const esperada = parametros.servicios.reduce((total, s) => total + s.duracionMinutos, 0);

        for (const opcion of generarItinerarios(parametros).itinerarios) {
          expect(opcion.duracionTotalMinutos).toBe(esperada);
          expect(opcion.terminaEn - opcion.comienzaEn).toBe(esperada * MINUTO);
        }
      }),
    );
  });

  it('los horarios ofrecidos no se repiten y vienen ordenados', () => {
    fc.assert(
      fc.property(escenario, ({ parametros }) => {
        const comienzos = generarItinerarios(parametros).itinerarios.map(
          (opcion: Itinerario) => opcion.comienzaEn,
        );

        expect(new Set(comienzos).size).toBe(comienzos.length);
        expect([...comienzos].sort((a, b) => a - b)).toEqual(comienzos);
      }),
    );
  });
});
