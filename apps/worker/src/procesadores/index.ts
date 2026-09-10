// Asocia cada cola con su procesador.
//
// Cada trabajo va envuelto en un reporte de errores. **Un trabajo que falla no
// le devuelve un error a nadie**: no hay pantalla que se ponga roja ni cliente
// que reclame en el momento. Sin esto, la única señal es el atraso que muestra
// `Panel → Estado`, y esa dice que algo pasa pero no qué.
//
// El error se vuelve a lanzar después de reportarlo: pg-boss necesita verlo
// para reintentar el trabajo.
import type PgBoss from 'pg-boss';

import { COLAS } from '../trabajos/index';
import { reportarFalloDeTrabajo } from '../configuracion/observabilidad';
import { expirarRetenciones } from './expirar-retenciones';
import { despacharNotificaciones } from './despachar-notificaciones';
import { reconciliarPagos } from './reconciliar-pagos';

/** Corre un trabajo dejando rastro si se cae, sin tragarse el error. */
async function conReporte(cola: string, trabajo: () => Promise<unknown>): Promise<void> {
  try {
    await trabajo();
  } catch (error: unknown) {
    reportarFalloDeTrabajo(cola, error);
    console.error(`El trabajo "${cola}" falló:`, error);

    throw error;
  }
}

export async function registrarProcesadores(cola: PgBoss): Promise<void> {
  await cola.work(COLAS.expirarRetenciones, async () => {
    await conReporte(COLAS.expirarRetenciones, expirarRetenciones);
  });

  await cola.work(COLAS.despacharBandejaSalida, async () => {
    await conReporte(COLAS.despacharBandejaSalida, despacharNotificaciones);
  });

  await cola.work(COLAS.reconciliarPagos, async () => {
    await conReporte(COLAS.reconciliarPagos, reconciliarPagos);
  });
}
