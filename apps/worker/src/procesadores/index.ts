// Asocia cada cola con su procesador.
// La lógica concreta se implementa en las fases 4 y 7 del plan.
import type PgBoss from 'pg-boss';

import { COLAS } from '../trabajos/index';
import { expirarRetenciones } from './expirar-retenciones';

export async function registrarProcesadores(cola: PgBoss): Promise<void> {
  await cola.work(COLAS.expirarRetenciones, async () => {
    await expirarRetenciones();
  });

  await cola.work(COLAS.despacharBandejaSalida, async () => {
    // Pendiente: Fase 7 — reintentar notificaciones de la bandeja de salida.
  });
}
