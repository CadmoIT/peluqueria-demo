// Sucursales de Manly. Una reserva ocurre siempre en una sola sucursal.
import { sql } from 'drizzle-orm';
import { boolean, check, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { marcasDeTiempo } from './comunes';

export const sucursales = pgTable(
  'sucursales',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    nombre: text('nombre').notNull(),
    barrio: text('barrio').notNull(),
    direccion: text('direccion').notNull(),
    telefono: text('telefono'),
    /** Número en formato internacional sin signos, para armar enlaces de wa.me. */
    whatsapp: text('whatsapp'),
    /** Enlace al mapa; se muestra en la página de sucursales y en el contacto. */
    urlMapa: text('url_mapa'),
    /**
     * Sobrescribe la anticipación mínima global para cancelar o reprogramar.
     * En null rige la de `configuracion_negocio`.
     */
    horasMinimasCancelacion: integer('horas_minimas_cancelacion'),
    activa: boolean('activa').notNull().default(true),
    orden: integer('orden').notNull().default(0),
    ...marcasDeTiempo,
  },
  (tabla) => [
    check(
      'sucursales_horas_cancelacion_no_negativas',
      sql`${tabla.horasMinimasCancelacion} IS NULL OR ${tabla.horasMinimasCancelacion} >= 0`,
    ),
  ],
);
