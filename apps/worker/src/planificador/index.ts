// Registra los trabajos recurrentes en pg-boss.
// Los horarios se expresan en cron con la zona horaria del negocio.
import type PgBoss from 'pg-boss';

import { COLAS } from '../trabajos/index';

export async function registrarTrabajosRecurrentes(
  cola: PgBoss,
  zonaHoraria: string,
): Promise<void> {
  // Cada minuto: liberar las retenciones vencidas lo antes posible.
  await cola.schedule(COLAS.expirarRetenciones, '* * * * *', {}, { tz: zonaHoraria });

  // Cada cinco minutos: reintentar las notificaciones que quedaron pendientes.
  await cola.schedule(COLAS.despacharBandejaSalida, '*/5 * * * *', {}, { tz: zonaHoraria });

  // Cada diez minutos: revisar los pagos que quedaron sin resolver.
  await cola.schedule(COLAS.reconciliarPagos, '*/10 * * * *', {}, { tz: zonaHoraria });
}
