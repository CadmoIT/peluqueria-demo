// Pruebas de la conversión de horario local a instantes reales.
//
// Es el punto donde un error no se ve: un turno ofrecido una hora corrida
// parece correcto en el código y está mal en la vida real.
import { describe, expect, it } from 'vitest';

import { calcularFranjasDeTrabajo, type ExcepcionHorario, type HorarioSemanal } from './calendario';

const BUENOS_AIRES = 'America/Argentina/Buenos_Aires';
const SUCURSAL = 'sucursal-1';
const OTRA_SUCURSAL = 'sucursal-2';
const ANA = 'profesional-ana';
const BETO = 'profesional-beto';

/** Jueves 1 de octubre de 2026 (día de semana 4). */
const JUEVES = '2026-10-01';

function rangoDelDia(fecha: string, zona = BUENOS_AIRES) {
  // El día completo en hora local, expresado como instantes.
  const desde = new Date(`${fecha}T00:00:00${zona === BUENOS_AIRES ? '-03:00' : 'Z'}`).getTime();
  return { desde, hasta: desde + 24 * 60 * 60 * 1000 };
}

function horario(parcial: Partial<HorarioSemanal> = {}): HorarioSemanal {
  return {
    profesionalId: ANA,
    sucursalId: SUCURSAL,
    diaSemana: 4,
    comienza: '10:00',
    termina: '20:00',
    ...parcial,
  };
}

function calcular(opciones: {
  horarios: HorarioSemanal[];
  excepciones?: ExcepcionHorario[];
  profesionalIds?: string[];
  zonaHoraria?: string;
  rango?: { desde: number; hasta: number };
}) {
  return calcularFranjasDeTrabajo({
    zonaHoraria: opciones.zonaHoraria ?? BUENOS_AIRES,
    sucursalId: SUCURSAL,
    profesionalIds: opciones.profesionalIds ?? [ANA],
    horarios: opciones.horarios,
    excepciones: opciones.excepciones ?? [],
    rango: opciones.rango ?? rangoDelDia(JUEVES),
  });
}

describe('horario semanal', () => {
  it('convierte la hora local de Buenos Aires al instante correcto', () => {
    const franjas = calcular({ horarios: [horario()] }).get(ANA)!;

    expect(franjas).toHaveLength(1);
    // Buenos Aires es UTC-3: de 10 a 20 local son las 13 a 23 UTC.
    expect(new Date(franjas[0]!.desde).toISOString()).toBe('2026-10-01T13:00:00.000Z');
    expect(new Date(franjas[0]!.hasta).toISOString()).toBe('2026-10-01T23:00:00.000Z');
  });

  it('ignora los horarios de otro día de la semana', () => {
    // El jueves es 4; este horario es de los lunes.
    const franjas = calcular({ horarios: [horario({ diaSemana: 1 })] }).get(ANA)!;

    expect(franjas).toEqual([]);
  });

  it('ignora los horarios de otra sucursal', () => {
    const franjas = calcular({ horarios: [horario({ sucursalId: OTRA_SUCURSAL })] }).get(ANA)!;

    expect(franjas).toEqual([]);
  });

  it('separa las franjas de cada profesional', () => {
    const resultado = calcular({
      profesionalIds: [ANA, BETO],
      horarios: [horario(), horario({ profesionalId: BETO, comienza: '14:00', termina: '18:00' })],
    });

    expect(resultado.get(ANA)).toHaveLength(1);
    expect(new Date(resultado.get(BETO)![0]!.desde).toISOString()).toBe('2026-10-01T17:00:00.000Z');
  });

  it('deja sin franjas a un profesional sin horario cargado', () => {
    const resultado = calcular({ profesionalIds: [ANA, BETO], horarios: [horario()] });

    expect(resultado.get(BETO)).toEqual([]);
  });

  it('une dos tramos contiguos del mismo día', () => {
    const franjas = calcular({
      horarios: [
        horario({ comienza: '10:00', termina: '14:00' }),
        horario({ comienza: '14:00', termina: '20:00' }),
      ],
    }).get(ANA)!;

    expect(franjas).toHaveLength(1);
    expect(new Date(franjas[0]!.hasta).toISOString()).toBe('2026-10-01T23:00:00.000Z');
  });

  it('mantiene separado el corte del mediodía', () => {
    const franjas = calcular({
      horarios: [
        horario({ comienza: '10:00', termina: '13:00' }),
        horario({ comienza: '16:00', termina: '20:00' }),
      ],
    }).get(ANA)!;

    expect(franjas).toHaveLength(2);
  });
});

describe('horario de verano', () => {
  // Argentina hoy no usa horario de verano, pero el motor no debe asumirlo:
  // si mañana cambia, o si se abre una sucursal en otro huso, la conversión
  // tiene que seguir siendo correcta.
  it('respeta el cambio de huso en un país que sí lo aplica', () => {
    const zona = 'Europe/Madrid';

    // 2026-03-29 es domingo (día 0) y es el día del salto en Madrid:
    // antes del cambio es UTC+1, después UTC+2.
    const desde = Date.UTC(2026, 2, 28, 0, 0);
    const franjas = calcularFranjasDeTrabajo({
      zonaHoraria: zona,
      sucursalId: SUCURSAL,
      profesionalIds: [ANA],
      horarios: [
        horario({ diaSemana: 6, comienza: '10:00', termina: '12:00' }), // sábado 28
        horario({ diaSemana: 0, comienza: '10:00', termina: '12:00' }), // domingo 29
      ],
      excepciones: [],
      rango: { desde, hasta: desde + 3 * 24 * 60 * 60 * 1000 },
    }).get(ANA)!;

    expect(franjas).toHaveLength(2);
    // Sábado: UTC+1, las 10 locales son las 09:00 UTC.
    expect(new Date(franjas[0]!.desde).toISOString()).toBe('2026-03-28T09:00:00.000Z');
    // Domingo, ya con el cambio: UTC+2, las 10 locales son las 08:00 UTC.
    expect(new Date(franjas[1]!.desde).toISOString()).toBe('2026-03-29T08:00:00.000Z');
  });
});

describe('excepciones', () => {
  function excepcion(parcial: Partial<ExcepcionHorario> = {}): ExcepcionHorario {
    return {
      profesionalId: ANA,
      sucursalId: SUCURSAL,
      tipo: 'bloqueo',
      comienzaEn: new Date('2026-10-01T15:00:00Z'),
      terminaEn: new Date('2026-10-01T17:00:00Z'),
      ...parcial,
    };
  }

  it('un bloqueo parte la franja en dos', () => {
    const franjas = calcular({ horarios: [horario()], excepciones: [excepcion()] }).get(ANA)!;

    expect(franjas).toHaveLength(2);
    expect(new Date(franjas[0]!.hasta).toISOString()).toBe('2026-10-01T15:00:00.000Z');
    expect(new Date(franjas[1]!.desde).toISOString()).toBe('2026-10-01T17:00:00.000Z');
  });

  it('un feriado de toda la sucursal deja sin franjas a todos', () => {
    const resultado = calcular({
      profesionalIds: [ANA, BETO],
      horarios: [horario(), horario({ profesionalId: BETO })],
      excepciones: [
        excepcion({
          profesionalId: null,
          tipo: 'feriado',
          comienzaEn: new Date('2026-10-01T00:00:00Z'),
          terminaEn: new Date('2026-10-02T00:00:00Z'),
        }),
      ],
    });

    expect(resultado.get(ANA)).toEqual([]);
    expect(resultado.get(BETO)).toEqual([]);
  });

  it('el bloqueo de un profesional no afecta al otro', () => {
    const resultado = calcular({
      profesionalIds: [ANA, BETO],
      horarios: [horario(), horario({ profesionalId: BETO })],
      excepciones: [excepcion()],
    });

    expect(resultado.get(ANA)).toHaveLength(2);
    expect(resultado.get(BETO)).toHaveLength(1);
  });

  it('una excepción de otra sucursal no aplica', () => {
    const franjas = calcular({
      horarios: [horario()],
      excepciones: [excepcion({ sucursalId: OTRA_SUCURSAL })],
    }).get(ANA)!;

    expect(franjas).toHaveLength(1);
  });

  it('la disponibilidad extra agrega horas fuera del horario semanal', () => {
    const franjas = calcular({
      horarios: [horario()],
      excepciones: [
        excepcion({
          tipo: 'disponibilidad_extra',
          comienzaEn: new Date('2026-10-01T23:00:00Z'),
          terminaEn: new Date('2026-10-02T01:00:00Z'),
        }),
      ],
      rango: {
        desde: new Date('2026-10-01T00:00:00Z').getTime(),
        hasta: new Date('2026-10-02T03:00:00Z').getTime(),
      },
    }).get(ANA)!;

    // Se pega al final del horario semanal, así que queda una sola franja larga.
    expect(franjas).toHaveLength(1);
    expect(new Date(franjas[0]!.hasta).toISOString()).toBe('2026-10-02T01:00:00.000Z');
  });

  it('el bloqueo le gana a la disponibilidad extra', () => {
    const franjas = calcular({
      horarios: [],
      excepciones: [
        excepcion({
          tipo: 'disponibilidad_extra',
          comienzaEn: new Date('2026-10-01T13:00:00Z'),
          terminaEn: new Date('2026-10-01T20:00:00Z'),
        }),
        excepcion({
          tipo: 'bloqueo',
          comienzaEn: new Date('2026-10-01T15:00:00Z'),
          terminaEn: new Date('2026-10-01T16:00:00Z'),
        }),
      ],
    }).get(ANA)!;

    expect(franjas).toHaveLength(2);
    expect(new Date(franjas[0]!.hasta).toISOString()).toBe('2026-10-01T15:00:00.000Z');
  });
});

describe('recorte al rango pedido', () => {
  it('no devuelve horas fuera de la ventana de búsqueda', () => {
    const desde = new Date('2026-10-01T16:00:00Z').getTime();
    const hasta = new Date('2026-10-01T18:00:00Z').getTime();

    const franjas = calcular({ horarios: [horario()], rango: { desde, hasta } }).get(ANA)!;

    expect(franjas).toHaveLength(1);
    expect(franjas[0]!.desde).toBe(desde);
    expect(franjas[0]!.hasta).toBe(hasta);
  });
});
