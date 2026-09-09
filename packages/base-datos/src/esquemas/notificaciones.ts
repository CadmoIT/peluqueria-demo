// Bandeja de salida de notificaciones.
//
// Nada se envía en línea: todo se encola acá y lo despacha el worker con
// reintentos. Así una caída de WhatsApp o de Resend no rompe una reserva, y
// queda registro de qué se intentó mandar y qué pasó.
import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { canalContacto, estadoNotificacion, marcasDeTiempo, tipoNotificacion } from './comunes';
import { reservas } from './reservas';

export const notificaciones = pgTable(
  'notificaciones',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    reservaId: uuid('reserva_id').references(() => reservas.id, { onDelete: 'cascade' }),
    tipo: tipoNotificacion('tipo').notNull(),
    canal: canalContacto('canal').notNull(),
    /** Número de WhatsApp o dirección de email de destino. */
    destino: text('destino').notNull(),
    estado: estadoNotificacion('estado').notNull().default('pendiente'),

    /** Nombre de la plantilla aprobada de WhatsApp, o del email. */
    plantilla: text('plantilla').notNull(),
    /** Variables con las que se arma el mensaje. */
    datos: jsonb('datos'),

    /** Cuándo corresponde enviarla. Los recordatorios se encolan con futuro. */
    programadaPara: timestamp('programada_para', { withTimezone: true }).notNull(),
    intentos: integer('intentos').notNull().default(0),
    enviadaEn: timestamp('enviada_en', { withTimezone: true }),
    ultimoError: text('ultimo_error'),
    ...marcasDeTiempo,
  },
  (tabla) => [
    // El worker busca por acá en cada corrida: pendientes ya vencidas.
    index('notificaciones_pendientes').on(tabla.estado, tabla.programadaPara),
    index('notificaciones_reserva').on(tabla.reservaId),
  ],
);
