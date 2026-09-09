// Convierte el horario del negocio en intervalos concretos de tiempo real.
//
// Los horarios semanales se guardan como hora local ("los martes de 10 a 20"),
// que no es un instante: depende del día y del huso. Acá se resuelve esa
// conversión con Luxon, que maneja bien los saltos de horario de verano; la
// aritmética a mano sobre milisegundos se equivoca en esos días.
//
// De acá para adentro del motor ya todo son milisegundos desde época.
import { DateTime } from 'luxon';

import { restar, unir, type Intervalo } from './intervalos';

/** Una franja que se repite todas las semanas, en hora local del negocio. */
export interface HorarioSemanal {
  profesionalId: string;
  sucursalId: string;
  /** 0 es domingo y 6 es sábado, igual que `Date.getDay()`. */
  diaSemana: number;
  /** Hora local en formato `HH:MM` o `HH:MM:SS`. */
  comienza: string;
  termina: string;
}

/** Algo puntual que altera el horario semanal. */
export interface ExcepcionHorario {
  /** En null, alcanza a todos los profesionales. */
  profesionalId: string | null;
  /** En null, alcanza a todas las sucursales. */
  sucursalId: string | null;
  tipo: 'bloqueo' | 'feriado' | 'disponibilidad_extra';
  comienzaEn: Date;
  terminaEn: Date;
}

export interface ParametrosCalendario {
  zonaHoraria: string;
  sucursalId: string;
  profesionalIds: string[];
  horarios: HorarioSemanal[];
  excepciones: ExcepcionHorario[];
  /** Ventana de búsqueda, en milisegundos desde época. */
  rango: Intervalo;
}

/** Parte `HH:MM[:SS]` en hora y minuto. */
function partirHora(hora: string): { hora: number; minuto: number } {
  const partes = hora.split(':');
  const valorHora = Number(partes[0] ?? '0');
  const valorMinuto = Number(partes[1] ?? '0');

  if (!Number.isFinite(valorHora) || !Number.isFinite(valorMinuto)) {
    throw new Error(`Hora inválida: ${hora}`);
  }

  return { hora: valorHora, minuto: valorMinuto };
}

/**
 * Instante real correspondiente a una hora local de un día dado.
 *
 * La hora se construye directamente sobre la fecha local. Sumarle minutos a la
 * medianoche NO sirve: sumar duración cruza los saltos de huso, y el día del
 * cambio de horario el resultado queda corrido una hora.
 *
 * En una hora que no existe (el salto de primavera) Luxon devuelve el instante
 * equivalente después del salto, que es el comportamiento razonable para un
 * horario de apertura.
 */
function instanteLocal(fecha: DateTime, horaLocal: string, zonaHoraria: string): number | null {
  const { hora, minuto } = partirHora(horaLocal);

  const local = DateTime.fromObject(
    { year: fecha.year, month: fecha.month, day: fecha.day, hour: hora, minute: minuto },
    { zone: zonaHoraria },
  );

  return local.isValid ? local.toMillis() : null;
}

/**
 * Franjas de trabajo de cada profesional dentro del rango pedido.
 *
 * Aplica, en este orden: el horario semanal de la sucursal, la disponibilidad
 * extra que se haya cargado, y por último los bloqueos y feriados, que se
 * restan y por lo tanto siempre ganan.
 */
export function calcularFranjasDeTrabajo(
  parametros: ParametrosCalendario,
): Map<string, Intervalo[]> {
  const { zonaHoraria, sucursalId, profesionalIds, horarios, excepciones, rango } = parametros;

  const franjas = new Map<string, Intervalo[]>(profesionalIds.map((id) => [id, []]));

  const horariosDeLaSucursal = horarios.filter((horario) => horario.sucursalId === sucursalId);

  // Se recorre día por día en la zona del negocio, no en UTC: el "martes" de
  // un horario semanal es el martes local.
  const primerDia = DateTime.fromMillis(rango.desde, { zone: zonaHoraria }).startOf('day');
  const ultimoDia = DateTime.fromMillis(rango.hasta, { zone: zonaHoraria }).startOf('day');

  for (let dia = primerDia; dia <= ultimoDia; dia = dia.plus({ days: 1 })) {
    // Luxon numera 1 como lunes y 7 como domingo; el esquema usa 0 para domingo.
    const diaSemana = dia.weekday % 7;

    for (const horario of horariosDeLaSucursal) {
      if (horario.diaSemana !== diaSemana) continue;

      const desde = instanteLocal(dia, horario.comienza, zonaHoraria);
      const hasta = instanteLocal(dia, horario.termina, zonaHoraria);

      if (desde === null || hasta === null || desde >= hasta) continue;

      const acumuladas = franjas.get(horario.profesionalId);
      if (!acumuladas) continue;

      // Recortado a la ventana pedida.
      const recorte = {
        desde: Math.max(desde, rango.desde),
        hasta: Math.min(hasta, rango.hasta),
      };

      if (recorte.desde < recorte.hasta) {
        acumuladas.push(recorte);
      }
    }
  }

  const alcanzaALaSucursal = (excepcion: ExcepcionHorario): boolean =>
    excepcion.sucursalId === null || excepcion.sucursalId === sucursalId;

  const extras = excepciones.filter(
    (excepcion) => excepcion.tipo === 'disponibilidad_extra' && alcanzaALaSucursal(excepcion),
  );

  const bloqueos = excepciones.filter(
    (excepcion) => excepcion.tipo !== 'disponibilidad_extra' && alcanzaALaSucursal(excepcion),
  );

  for (const profesionalId of profesionalIds) {
    const aplicaA = (excepcion: ExcepcionHorario): boolean =>
      excepcion.profesionalId === null || excepcion.profesionalId === profesionalId;

    const propias = franjas.get(profesionalId) ?? [];

    const conExtras = unir([
      ...propias,
      ...extras.filter(aplicaA).map((excepcion) => ({
        desde: Math.max(excepcion.comienzaEn.getTime(), rango.desde),
        hasta: Math.min(excepcion.terminaEn.getTime(), rango.hasta),
      })),
    ]);

    const sinBloqueos = restar(
      conExtras,
      bloqueos.filter(aplicaA).map((excepcion) => ({
        desde: excepcion.comienzaEn.getTime(),
        hasta: excepcion.terminaEn.getTime(),
      })),
    );

    franjas.set(profesionalId, sinBloqueos);
  }

  return franjas;
}

/** Formatea un instante en la zona del negocio, para mensajes y registros. */
export function enHoraLocal(instante: number, zonaHoraria: string): string {
  return DateTime.fromMillis(instante, { zone: zonaHoraria }).toFormat('dd/MM/yyyy HH:mm');
}
