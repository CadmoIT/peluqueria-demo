// Profesionales, y en qué sucursales y servicios trabaja cada uno.
import { sql } from 'drizzle-orm';
import { boolean, integer, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';

import { marcasDeTiempo } from './comunes';
import { servicios } from './servicios';
import { sucursales } from './sucursales';
import { usuarios } from './usuarios';

export const profesionales = pgTable('profesionales', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  /** Usuario del panel asociado. En null si todavía no fue invitado. */
  usuarioId: uuid('usuario_id').references(() => usuarios.id, { onDelete: 'set null' }),
  nombre: text('nombre').notNull(),
  /** Cómo se lo presenta al cliente al elegir profesional. */
  nombreVisible: text('nombre_visible'),
  activo: boolean('activo').notNull().default(true),
  orden: integer('orden').notNull().default(0),
  ...marcasDeTiempo,
});

/** En qué sucursales atiende cada profesional. */
export const profesionalesSucursales = pgTable(
  'profesionales_sucursales',
  {
    profesionalId: uuid('profesional_id')
      .notNull()
      .references(() => profesionales.id, { onDelete: 'cascade' }),
    sucursalId: uuid('sucursal_id')
      .notNull()
      .references(() => sucursales.id, { onDelete: 'cascade' }),
  },
  (tabla) => [primaryKey({ columns: [tabla.profesionalId, tabla.sucursalId] })],
);

/** Qué servicios sabe hacer cada profesional. */
export const profesionalesServicios = pgTable(
  'profesionales_servicios',
  {
    profesionalId: uuid('profesional_id')
      .notNull()
      .references(() => profesionales.id, { onDelete: 'cascade' }),
    servicioId: uuid('servicio_id')
      .notNull()
      .references(() => servicios.id, { onDelete: 'cascade' }),
  },
  (tabla) => [primaryKey({ columns: [tabla.profesionalId, tabla.servicioId] })],
);
