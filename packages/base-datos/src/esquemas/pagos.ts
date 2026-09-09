// Movimientos de dinero de una reserva: seña, saldo y reintegros.
//
// Manly no almacena datos de tarjeta. De Mercado Pago sólo se guarda el
// identificador del pago y la respuesta cruda, para poder auditar y reconciliar.
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { estadoPago, marcasDeTiempo, medioPago, tipoPago } from './comunes';
import { reservas } from './reservas';
import { usuarios } from './usuarios';

export const pagos = pgTable(
  'pagos',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    reservaId: uuid('reserva_id')
      .notNull()
      .references(() => reservas.id, { onDelete: 'cascade' }),
    tipo: tipoPago('tipo').notNull(),
    medio: medioPago('medio').notNull(),
    estado: estadoPago('estado').notNull().default('pendiente'),
    montoCentavos: integer('monto_centavos').notNull(),

    /**
     * `external_reference` que se le manda a Mercado Pago para poder atar el
     * webhook a la reserva. El nombre del campo lo impone el proveedor.
     */
    referenciaExterna: text('referencia_externa'),
    /** `id` del pago en Mercado Pago. Único: hace idempotente el webhook. */
    idPagoExterno: text('id_pago_externo'),
    /** Respuesta cruda del proveedor, para auditar y reconciliar. */
    datosCrudos: jsonb('datos_crudos'),

    /** Queda cargado cuando el pago lo registró alguien del panel. */
    registradoPorUsuarioId: uuid('registrado_por_usuario_id').references(() => usuarios.id, {
      onDelete: 'set null',
    }),
    acreditadoEn: timestamp('acreditado_en', { withTimezone: true }),
    ...marcasDeTiempo,
  },
  (tabla) => [
    check('pagos_monto_positivo', sql`${tabla.montoCentavos} > 0`),
    // Un mismo pago de Mercado Pago no se registra dos veces, aunque el
    // webhook llegue repetido.
    uniqueIndex('pagos_id_externo_unico')
      .on(tabla.idPagoExterno)
      .where(sql`${tabla.idPagoExterno} IS NOT NULL`),
    index('pagos_reserva').on(tabla.reservaId),
    index('pagos_referencia_externa').on(tabla.referenciaExterna),
  ],
);
