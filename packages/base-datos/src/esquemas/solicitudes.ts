// Solicitudes de cambio que el cliente pide fuera del plazo automático.
//
// Dentro del plazo mínimo, cancelar o reprogramar no es automático: se crea una
// solicitud y el horario original sigue ocupado hasta que gerencia la resuelve.
import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { estadoSolicitud, marcasDeTiempo, tipoSolicitud } from './comunes';
import { reservas } from './reservas';
import { usuarios } from './usuarios';

export const solicitudesCambio = pgTable(
  'solicitudes_cambio',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    reservaId: uuid('reserva_id')
      .notNull()
      .references(() => reservas.id, { onDelete: 'cascade' }),
    tipo: tipoSolicitud('tipo').notNull(),
    estado: estadoSolicitud('estado').notNull().default('pendiente'),
    motivo: text('motivo'),
    /** Horario propuesto por el cliente cuando el tipo es `reprogramacion`. */
    propuesta: jsonb('propuesta'),
    /** Nota de gerencia al aprobar o rechazar. */
    respuesta: text('respuesta'),
    resueltaPorUsuarioId: uuid('resuelta_por_usuario_id').references(() => usuarios.id, {
      onDelete: 'set null',
    }),
    resueltaEn: timestamp('resuelta_en', { withTimezone: true }),
    ...marcasDeTiempo,
  },
  (tabla) => [
    index('solicitudes_estado').on(tabla.estado),
    index('solicitudes_reserva').on(tabla.reservaId),
  ],
);
