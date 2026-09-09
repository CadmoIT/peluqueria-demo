// Servicios ofrecidos, con su duración, precio y regla de seña.
//
// El precio es único: no cambia según el medio de pago. Cuando se crea una
// reserva, precio y duración se copian como snapshot a `reservas_servicios`,
// así modificar un servicio después no altera las reservas ya tomadas.
import { sql } from 'drizzle-orm';
import { boolean, check, integer, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';

import { marcasDeTiempo, modalidadSenia } from './comunes';
import { sucursales } from './sucursales';

export const servicios = pgTable(
  'servicios',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    nombre: text('nombre').notNull(),
    descripcion: text('descripcion'),
    /** Agrupa servicios en la página pública. */
    categoria: text('categoria'),

    /** Tiempo que el cliente ocupa la silla. */
    duracionMinutos: integer('duracion_minutos').notNull(),
    /** Tiempo previo que el profesional necesita y que no se le muestra al cliente. */
    minutosPreparacion: integer('minutos_preparacion').notNull().default(0),
    /** Tiempo posterior de limpieza, tampoco visible para el cliente. */
    minutosLimpieza: integer('minutos_limpieza').notNull().default(0),

    /** Precio único en centavos. Nunca en punto flotante. */
    precioCentavos: integer('precio_centavos').notNull(),

    modalidadSenia: modalidadSenia('modalidad_senia').notNull().default('deshabilitada'),
    /** Monto fijo de seña, sólo cuando la modalidad es `fija`. */
    seniaFijaCentavos: integer('senia_fija_centavos'),
    /** Porcentaje del precio, sólo cuando la modalidad es `porcentual`. */
    seniaPorcentaje: integer('senia_porcentaje'),

    /** Sobrescribe la anticipación mínima global. En null rige la de la sucursal o la global. */
    horasMinimasCancelacion: integer('horas_minimas_cancelacion'),

    activo: boolean('activo').notNull().default(true),
    orden: integer('orden').notNull().default(0),
    ...marcasDeTiempo,
  },
  (tabla) => [
    check('servicios_duracion_positiva', sql`${tabla.duracionMinutos} > 0`),
    check('servicios_precio_no_negativo', sql`${tabla.precioCentavos} >= 0`),
    check(
      'servicios_buffers_no_negativos',
      sql`${tabla.minutosPreparacion} >= 0 AND ${tabla.minutosLimpieza} >= 0`,
    ),
    check(
      'servicios_porcentaje_valido',
      sql`${tabla.seniaPorcentaje} IS NULL OR (${tabla.seniaPorcentaje} > 0 AND ${tabla.seniaPorcentaje} <= 100)`,
    ),
    // La regla de seña tiene que ser coherente con su modalidad: la base no
    // acepta una seña fija sin monto ni una porcentual sin porcentaje.
    check(
      'servicios_senia_coherente',
      sql`
        (${tabla.modalidadSenia} = 'deshabilitada'
          AND ${tabla.seniaFijaCentavos} IS NULL
          AND ${tabla.seniaPorcentaje} IS NULL)
        OR (${tabla.modalidadSenia} = 'fija'
          AND ${tabla.seniaFijaCentavos} IS NOT NULL
          AND ${tabla.seniaFijaCentavos} > 0
          AND ${tabla.seniaPorcentaje} IS NULL)
        OR (${tabla.modalidadSenia} = 'porcentual'
          AND ${tabla.seniaPorcentaje} IS NOT NULL
          AND ${tabla.seniaFijaCentavos} IS NULL)
      `,
    ),
  ],
);

/** Sucursales donde se presta cada servicio. */
export const serviciosSucursales = pgTable(
  'servicios_sucursales',
  {
    servicioId: uuid('servicio_id')
      .notNull()
      .references(() => servicios.id, { onDelete: 'cascade' }),
    sucursalId: uuid('sucursal_id')
      .notNull()
      .references(() => sucursales.id, { onDelete: 'cascade' }),
  },
  (tabla) => [primaryKey({ columns: [tabla.servicioId, tabla.sucursalId] })],
);
