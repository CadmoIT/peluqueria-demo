// Disponibilidad base de cada profesional y las excepciones que la alteran.
//
// `horarios_semanales` es la agenda que se repite todas las semanas.
// `excepciones_horario` es lo puntual: feriados, bloqueos y turnos extra.
import { sql } from 'drizzle-orm';
import { check, index, pgTable, smallint, text, time, timestamp, uuid } from 'drizzle-orm/pg-core';

import { marcasDeTiempo, tipoExcepcion } from './comunes';
import { profesionales } from './profesionales';
import { sucursales } from './sucursales';

export const horariosSemanales = pgTable(
  'horarios_semanales',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    profesionalId: uuid('profesional_id')
      .notNull()
      .references(() => profesionales.id, { onDelete: 'cascade' }),
    sucursalId: uuid('sucursal_id')
      .notNull()
      .references(() => sucursales.id, { onDelete: 'cascade' }),
    /** 0 es domingo, 6 es sábado, igual que `Date.getDay()`. */
    diaSemana: smallint('dia_semana').notNull(),
    /** Hora local del negocio, no UTC: un horario semanal no tiene fecha. */
    comienza: time('comienza').notNull(),
    termina: time('termina').notNull(),
    ...marcasDeTiempo,
  },
  (tabla) => [
    check('horarios_dia_semana_valido', sql`${tabla.diaSemana} BETWEEN 0 AND 6`),
    check('horarios_rango_valido', sql`${tabla.comienza} < ${tabla.termina}`),
    index('horarios_profesional_dia').on(tabla.profesionalId, tabla.diaSemana),
  ],
);

export const excepcionesHorario = pgTable(
  'excepciones_horario',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /** En null, la excepción alcanza a todos los profesionales de la sucursal. */
    profesionalId: uuid('profesional_id').references(() => profesionales.id, {
      onDelete: 'cascade',
    }),
    /** En null, la excepción alcanza a todas las sucursales. */
    sucursalId: uuid('sucursal_id').references(() => sucursales.id, { onDelete: 'cascade' }),
    tipo: tipoExcepcion('tipo').notNull(),
    comienzaEn: timestamp('comienza_en', { withTimezone: true }).notNull(),
    terminaEn: timestamp('termina_en', { withTimezone: true }).notNull(),
    motivo: text('motivo'),
    ...marcasDeTiempo,
  },
  (tabla) => [
    check('excepciones_rango_valido', sql`${tabla.comienzaEn} < ${tabla.terminaEn}`),
    // Una excepción sin profesional ni sucursal no alcanzaría a nadie.
    check(
      'excepciones_alcance_definido',
      sql`${tabla.profesionalId} IS NOT NULL OR ${tabla.sucursalId} IS NOT NULL`,
    ),
    index('excepciones_rango').on(tabla.comienzaEn, tabla.terminaEn),
    index('excepciones_profesional').on(tabla.profesionalId),
  ],
);
