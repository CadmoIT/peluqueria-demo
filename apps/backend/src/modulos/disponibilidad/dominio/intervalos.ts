// Álgebra de intervalos de tiempo.
//
// Todo se expresa en milisegundos desde época, sin zona horaria: acá no hay
// husos ni horarios de verano, sólo números. La conversión desde el horario
// local del negocio vive en `calendario.ts`.
//
// Los intervalos son semiabiertos `[desde, hasta)`: uno que termina a las 14:00
// y otro que empieza a las 14:00 no se solapan. Es la misma convención que usa
// la restricción EXCLUDE de la base, y tienen que coincidir.

export interface Intervalo {
  desde: number;
  hasta: number;
}

/** Un intervalo es válido si tiene duración positiva. */
export function esValido(intervalo: Intervalo): boolean {
  return intervalo.desde < intervalo.hasta;
}

export function duracionMinutos(intervalo: Intervalo): number {
  return (intervalo.hasta - intervalo.desde) / 60_000;
}

/** Dos intervalos se solapan si comparten al menos un instante. */
export function solapan(a: Intervalo, b: Intervalo): boolean {
  return a.desde < b.hasta && b.desde < a.hasta;
}

/** `contenedor` cubre por completo a `contenido`. */
export function contiene(contenedor: Intervalo, contenido: Intervalo): boolean {
  return contenedor.desde <= contenido.desde && contenedor.hasta >= contenido.hasta;
}

/** Ordena por inicio y, a igual inicio, por fin. */
export function ordenar(intervalos: Intervalo[]): Intervalo[] {
  return [...intervalos].sort((a, b) => a.desde - b.desde || a.hasta - b.hasta);
}

/**
 * Une los intervalos que se tocan o se solapan.
 * Devuelve una lista ordenada y sin superposiciones.
 */
export function unir(intervalos: Intervalo[]): Intervalo[] {
  const ordenados = ordenar(intervalos.filter(esValido));
  const resultado: Intervalo[] = [];

  for (const actual of ordenados) {
    const ultimo = resultado[resultado.length - 1];

    if (ultimo && actual.desde <= ultimo.hasta) {
      ultimo.hasta = Math.max(ultimo.hasta, actual.hasta);
    } else {
      resultado.push({ ...actual });
    }
  }

  return resultado;
}

/**
 * Le quita a `base` todo lo que cubran los intervalos de `quitar`.
 * Es la operación que convierte el horario laboral en huecos realmente libres.
 */
export function restar(base: Intervalo[], quitar: Intervalo[]): Intervalo[] {
  const aQuitar = unir(quitar);
  let pendientes = unir(base);

  for (const hueco of aQuitar) {
    const siguiente: Intervalo[] = [];

    for (const trozo of pendientes) {
      if (!solapan(trozo, hueco)) {
        siguiente.push(trozo);
        continue;
      }

      // Lo que queda del trozo antes del hueco.
      if (trozo.desde < hueco.desde) {
        siguiente.push({ desde: trozo.desde, hasta: hueco.desde });
      }

      // Y lo que queda después.
      if (trozo.hasta > hueco.hasta) {
        siguiente.push({ desde: hueco.hasta, hasta: trozo.hasta });
      }
    }

    pendientes = siguiente;
  }

  return pendientes;
}

/** Parte común de dos listas de intervalos. */
export function intersectar(a: Intervalo[], b: Intervalo[]): Intervalo[] {
  const unoU = unir(a);
  const otroU = unir(b);
  const resultado: Intervalo[] = [];

  for (const uno of unoU) {
    for (const otro of otroU) {
      const desde = Math.max(uno.desde, otro.desde);
      const hasta = Math.min(uno.hasta, otro.hasta);

      if (desde < hasta) {
        resultado.push({ desde, hasta });
      }
    }
  }

  return ordenar(resultado);
}

/** Alguno de los intervalos cubre por completo al buscado. */
export function algunoContiene(intervalos: Intervalo[], buscado: Intervalo): boolean {
  return unir(intervalos).some((intervalo) => contiene(intervalo, buscado));
}

/** Alguno de los intervalos se solapa con el buscado. */
export function algunoSolapa(intervalos: Intervalo[], buscado: Intervalo): boolean {
  return intervalos.some((intervalo) => solapan(intervalo, buscado));
}

/**
 * Instantes candidatos para arrancar dentro de los intervalos dados.
 *
 * Se alinean a la grilla de `pasoMinutos` contada desde época, para que los
 * horarios ofrecidos caigan siempre en :00, :15, :30 y :45 y no en minutos
 * arbitrarios heredados del horario de apertura.
 */
export function instantesCandidatos(
  intervalos: Intervalo[],
  pasoMinutos: number,
  duracionTotalMinutos: number,
): number[] {
  if (pasoMinutos <= 0) {
    throw new Error('El paso de la grilla tiene que ser positivo.');
  }

  const paso = pasoMinutos * 60_000;
  const duracion = duracionTotalMinutos * 60_000;
  const candidatos: number[] = [];

  for (const intervalo of unir(intervalos)) {
    const primero = Math.ceil(intervalo.desde / paso) * paso;

    for (let instante = primero; instante + duracion <= intervalo.hasta; instante += paso) {
      candidatos.push(instante);
    }
  }

  return [...new Set(candidatos)].sort((a, b) => a - b);
}
