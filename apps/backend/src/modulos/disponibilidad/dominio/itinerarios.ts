// Genera los itinerarios que se le ofrecen al cliente.
//
// Un itinerario es una secuencia de bloques consecutivos y sin tiempos muertos:
// cada servicio empieza exactamente cuando termina el anterior. Todos ocurren
// en la misma sucursal, y cada uno puede quedar a cargo de un profesional
// distinto.
//
// Dos ventanas por bloque, y la diferencia importa:
//
//   - la del cliente, que es la duración del servicio y es la que se le muestra;
//   - la ocupada, que le suma la preparación previa y la limpieza posterior, y
//     es la que se compara contra la agenda.
//
// Dos servicios pueden verse pegados para el cliente y aun así ser imposibles
// para un mismo profesional, porque sus ventanas ocupadas se pisan. Es la misma
// regla que hace cumplir la restricción EXCLUDE de la base.

import {
  algunoContiene,
  algunoSolapa,
  instantesCandidatos,
  solapan,
  unir,
  type Intervalo,
} from './intervalos';

export interface ServicioSolicitado {
  servicioId: string;
  nombre: string;
  duracionMinutos: number;
  minutosPreparacion: number;
  minutosLimpieza: number;
  precioCentavos: number;
  seniaCentavos: number;
  /** Profesional pedido, o null para "cualquiera". */
  profesionalPreferidoId: string | null;
  /** Profesionales que pueden prestarlo en la sucursal, en orden de preferencia. */
  profesionalesCompatibles: string[];
}

export interface BloqueItinerario {
  orden: number;
  servicioId: string;
  servicioNombre: string;
  profesionalId: string;
  /** Ventana que ve el cliente. */
  comienzaEn: number;
  terminaEn: number;
  /** Ventana que ocupa la agenda, con preparación y limpieza. */
  ocupaDesde: number;
  ocupaHasta: number;
  duracionMinutos: number;
  precioCentavos: number;
  seniaCentavos: number;
}

export interface Itinerario {
  comienzaEn: number;
  terminaEn: number;
  duracionTotalMinutos: number;
  precioTotalCentavos: number;
  seniaTotalCentavos: number;
  bloques: BloqueItinerario[];
}

export interface ParametrosItinerarios {
  servicios: ServicioSolicitado[];
  /** Franjas de trabajo por profesional, ya con feriados y bloqueos restados. */
  franjasPorProfesional: Map<string, Intervalo[]>;
  /** Ventanas ya ocupadas por reservas activas, por profesional. */
  ocupadoPorProfesional: Map<string, Intervalo[]>;
  /** Ventana en la que buscar. */
  rango: Intervalo;
  /** Granularidad de los horarios ofrecidos. */
  pasoMinutos: number;
  /** Tope de opciones a devolver. */
  maximoOpciones: number;
  /**
   * Permite reordenar los servicios si en el orden pedido no entran.
   * El plan lo exige: el motor evalúa las combinaciones y órdenes posibles.
   */
  permitirReordenar: boolean;
}

export interface ResultadoItinerarios {
  itinerarios: Itinerario[];
  /** Quedaron más opciones sin devolver por el tope. */
  hayMas: boolean;
}

const MINUTO = 60_000;

/** Permutaciones de los índices `0..cantidad-1`, empezando por el orden pedido. */
function permutaciones(cantidad: number): number[][] {
  const base = Array.from({ length: cantidad }, (_, indice) => indice);

  if (cantidad <= 1) return [base];

  const resultado: number[][] = [];

  const recorrer = (actual: number[], restantes: number[]): void => {
    if (restantes.length === 0) {
      resultado.push(actual);
      return;
    }

    for (let i = 0; i < restantes.length; i += 1) {
      recorrer([...actual, restantes[i]!], [...restantes.slice(0, i), ...restantes.slice(i + 1)]);
    }
  };

  recorrer([], base);

  return resultado;
}

/** Profesionales que se pueden considerar para un servicio, respetando la preferencia. */
function candidatosPara(servicio: ServicioSolicitado): string[] {
  if (servicio.profesionalPreferidoId !== null) {
    // Si pidió a alguien en concreto, no se le ofrece otro.
    return servicio.profesionalesCompatibles.includes(servicio.profesionalPreferidoId)
      ? [servicio.profesionalPreferidoId]
      : [];
  }

  return servicio.profesionalesCompatibles;
}

/**
 * Intenta armar la secuencia completa a partir de un instante, probando un
 * orden de servicios. Asigna profesionales con vuelta atrás y devuelve el
 * primer itinerario válido, o null si en ese orden no entra.
 */
function armarDesde(
  comienzo: number,
  orden: number[],
  servicios: ServicioSolicitado[],
  franjasPorProfesional: Map<string, Intervalo[]>,
  ocupadoPorProfesional: Map<string, Intervalo[]>,
): BloqueItinerario[] | null {
  const bloques: BloqueItinerario[] = [];

  const paso = (indiceEnOrden: number, instante: number): boolean => {
    if (indiceEnOrden === orden.length) return true;

    const servicio = servicios[orden[indiceEnOrden]!]!;
    const comienzaEn = instante;
    const terminaEn = comienzaEn + servicio.duracionMinutos * MINUTO;
    const ventanaOcupada: Intervalo = {
      desde: comienzaEn - servicio.minutosPreparacion * MINUTO,
      hasta: terminaEn + servicio.minutosLimpieza * MINUTO,
    };

    for (const profesionalId of candidatosPara(servicio)) {
      const franjas = franjasPorProfesional.get(profesionalId) ?? [];

      // Tiene que estar trabajando durante toda la ventana ocupada, no sólo
      // durante el servicio: la limpieza también es tiempo de trabajo.
      if (!algunoContiene(franjas, ventanaOcupada)) continue;

      const ocupado = ocupadoPorProfesional.get(profesionalId) ?? [];
      if (algunoSolapa(ocupado, ventanaOcupada)) continue;

      // Y tampoco puede pisarse con un bloque anterior de este mismo
      // itinerario: es el caso de dos servicios seguidos con el mismo
      // profesional, donde la limpieza de uno invade la preparación del otro.
      const sePisaConLoYaArmado = bloques.some(
        (previo) =>
          previo.profesionalId === profesionalId &&
          solapan({ desde: previo.ocupaDesde, hasta: previo.ocupaHasta }, ventanaOcupada),
      );

      if (sePisaConLoYaArmado) continue;

      bloques.push({
        orden: indiceEnOrden,
        servicioId: servicio.servicioId,
        servicioNombre: servicio.nombre,
        profesionalId,
        comienzaEn,
        terminaEn,
        ocupaDesde: ventanaOcupada.desde,
        ocupaHasta: ventanaOcupada.hasta,
        duracionMinutos: servicio.duracionMinutos,
        precioCentavos: servicio.precioCentavos,
        seniaCentavos: servicio.seniaCentavos,
      });

      if (paso(indiceEnOrden + 1, terminaEn)) return true;

      bloques.pop();
    }

    return false;
  };

  return paso(0, comienzo) ? bloques : null;
}

/**
 * Busca opciones para el cliente.
 *
 * Devuelve como mucho un itinerario por instante de comienzo: al cliente le
 * sirve elegir un horario, no ver todas las asignaciones internas posibles de
 * ese mismo horario.
 */
export function generarItinerarios(parametros: ParametrosItinerarios): ResultadoItinerarios {
  const {
    servicios,
    franjasPorProfesional,
    ocupadoPorProfesional,
    rango,
    pasoMinutos,
    maximoOpciones,
    permitirReordenar,
  } = parametros;

  if (servicios.length === 0) {
    return { itinerarios: [], hayMas: false };
  }

  // Si algún servicio no tiene ningún profesional posible, no hay nada que buscar.
  if (servicios.some((servicio) => candidatosPara(servicio).length === 0)) {
    return { itinerarios: [], hayMas: false };
  }

  const duracionTotalMinutos = servicios.reduce(
    (total, servicio) => total + servicio.duracionMinutos,
    0,
  );

  // Los comienzos posibles salen de la unión de las franjas de los
  // profesionales que podrían tomar el primer bloque. Buscar fuera de ahí es
  // recorrer horas en las que no trabaja nadie.
  const franjasRelevantes = unir(
    [...new Set(servicios.flatMap(candidatosPara))].flatMap(
      (profesionalId) => franjasPorProfesional.get(profesionalId) ?? [],
    ),
  );

  const comienzos = instantesCandidatos(
    franjasRelevantes.map((franja) => ({
      desde: Math.max(franja.desde, rango.desde),
      hasta: Math.min(franja.hasta, rango.hasta),
    })),
    pasoMinutos,
    duracionTotalMinutos,
  );

  const ordenes = permitirReordenar
    ? permutaciones(servicios.length)
    : [Array.from({ length: servicios.length }, (_, indice) => indice)];

  const itinerarios: Itinerario[] = [];
  let hayMas = false;

  for (const comienzo of comienzos) {
    if (itinerarios.length >= maximoOpciones) {
      hayMas = true;
      break;
    }

    for (const orden of ordenes) {
      const bloques = armarDesde(
        comienzo,
        orden,
        servicios,
        franjasPorProfesional,
        ocupadoPorProfesional,
      );

      if (!bloques) continue;

      itinerarios.push({
        comienzaEn: comienzo,
        terminaEn: bloques[bloques.length - 1]!.terminaEn,
        duracionTotalMinutos,
        precioTotalCentavos: bloques.reduce((total, bloque) => total + bloque.precioCentavos, 0),
        seniaTotalCentavos: bloques.reduce((total, bloque) => total + bloque.seniaCentavos, 0),
        bloques,
      });

      // Basta con una asignación por horario.
      break;
    }
  }

  return { itinerarios, hayMas };
}
