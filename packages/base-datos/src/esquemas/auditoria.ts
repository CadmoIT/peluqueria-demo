// Registro de acciones administrativas.
//
// Toda modificación relevante hecha desde el panel deja rastro acá: quién,
// qué, sobre qué entidad y con qué valores antes y después. Es sólo de
// escritura: nunca se edita ni se borra una fila de auditoría.
import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { usuarios } from './usuarios';

export const auditoria = pgTable(
  'auditoria',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /** En null cuando la acción la originó el sistema, no una persona. */
    usuarioId: uuid('usuario_id').references(() => usuarios.id, { onDelete: 'set null' }),
    /** Qué se hizo, en pasado: `reserva.cancelada`, `servicio.precio_actualizado`. */
    accion: text('accion').notNull(),
    /** Tabla o agregado afectado. */
    entidad: text('entidad').notNull(),
    entidadId: uuid('entidad_id'),
    datosAntes: jsonb('datos_antes'),
    datosDespues: jsonb('datos_despues'),
    direccionIp: text('direccion_ip'),
    creadoEn: timestamp('creado_en', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (tabla) => [
    index('auditoria_entidad').on(tabla.entidad, tabla.entidadId),
    index('auditoria_usuario_fecha').on(tabla.usuarioId, tabla.creadoEn),
  ],
);
