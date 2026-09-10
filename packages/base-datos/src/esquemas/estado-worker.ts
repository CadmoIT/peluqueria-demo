// Lo último que dijo el worker sobre sí mismo.
//
// El worker corre en otro servicio, con su propia configuración: la API no
// puede saber si sus canales de notificación son reales o simulados, ni si
// sigue tomando trabajo de la cola. Esta fila es la única vía por la que se
// entera.
//
// Existe por dos preguntas que en producción se responden tarde y mal: «¿por
// qué no salen los recordatorios?» y «¿estamos mandando WhatsApp de verdad?».
// La segunda es la peor, porque el simulador registra los envíos como exitosos.
import { sql } from 'drizzle-orm';
import { boolean, check, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const estadoWorker = pgTable(
  'estado_worker',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /** Fuerza una sola fila, igual que `configuracion_negocio`. */
    filaUnica: boolean('fila_unica').notNull().default(true),

    /** Cuándo terminó de correr por última vez. Se actualiza en cada pasada. */
    ultimaCorrida: timestamp('ultima_corrida', { withTimezone: true })
      .notNull()
      .default(sql`now()`),

    /** `real` o `simulado`. Es lo que el panel muestra en la pantalla de estado. */
    canalWhatsapp: text('canal_whatsapp').notNull().default('simulado'),
    canalEmail: text('canal_email').notNull().default('simulado'),

    /** Versión del proceso, para saber si quedó una vieja dando vueltas. */
    version: text('version'),
  },
  (tabla) => [
    check('estado_worker_fila_unica_es_true', sql`${tabla.filaUnica} = true`),
    uniqueIndex('estado_worker_fila_unica').on(tabla.filaUnica),
    check(
      'estado_worker_canales_validos',
      sql`
      ${tabla.canalWhatsapp} IN ('real', 'simulado')
      AND ${tabla.canalEmail} IN ('real', 'simulado')
    `,
    ),
  ],
);
