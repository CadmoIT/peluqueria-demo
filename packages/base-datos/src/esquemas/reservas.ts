// Reservas y los bloques consecutivos que las componen.
//
// `reservas` es la operación completa que el cliente confirma o cancela como
// una unidad. `reservas_servicios` es cada bloque: un servicio, un profesional
// y una franja horaria. Una reserva multiservicio puede repartir sus bloques
// entre profesionales distintos, pero siempre en una sola sucursal y sin
// tiempos muertos entre ellos.
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { canalContacto, estadoReserva, marcasDeTiempo } from './comunes';
import { profesionales } from './profesionales';
import { servicios } from './servicios';
import { sucursales } from './sucursales';
import { usuarios } from './usuarios';

export const reservas = pgTable(
  'reservas',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    sucursalId: uuid('sucursal_id')
      .notNull()
      .references(() => sucursales.id, { onDelete: 'restrict' }),
    estado: estadoReserva('estado').notNull().default('pendiente_pago'),

    // ── Cliente ────────────────────────────────────────────────────────────
    // No se crea cuenta ni se guarda historial comercial: sólo lo necesario
    // para avisarle del turno.
    // Quedan vacíos mientras la reserva sólo retiene el horario: el flujo del
    // plan reserva los bloques al elegir la opción y recién después pide los
    // datos. Un CHECK exige que estén completos en cualquier otro estado.
    clienteNombre: text('cliente_nombre'),
    canalContacto: canalContacto('canal_contacto'),
    contactoWhatsapp: text('contacto_whatsapp'),
    contactoEmail: text('contacto_email'),

    // ── Ventana total ──────────────────────────────────────────────────────
    // Extremos de los bloques. Se guardan acá para poder listar la agenda sin
    // recorrer los bloques de cada reserva.
    comienzaEn: timestamp('comienza_en', { withTimezone: true }).notNull(),
    terminaEn: timestamp('termina_en', { withTimezone: true }).notNull(),

    // ── Dinero (snapshots, en centavos) ────────────────────────────────────
    precioTotalCentavos: integer('precio_total_centavos').notNull(),
    seniaTotalCentavos: integer('senia_total_centavos').notNull().default(0),

    // ── Gestión sin cuenta ─────────────────────────────────────────────────
    /** Hash del token del enlace privado. El token en claro sólo lo tiene el cliente. */
    hashTokenGestion: text('hash_token_gestion').notNull(),
    /**
     * Hasta cuándo la selección retiene los bloques. Vencido el plazo sin pago
     * aprobado, el worker pasa la reserva a `expirada` y libera los horarios.
     */
    retencionExpiraEn: timestamp('retencion_expira_en', { withTimezone: true }),

    aceptoCondicionesEn: timestamp('acepto_condiciones_en', { withTimezone: true }),
    notas: text('notas'),
    /** Queda cargado cuando la reserva la creó alguien del panel, no el cliente. */
    creadaPorUsuarioId: uuid('creada_por_usuario_id').references(() => usuarios.id, {
      onDelete: 'set null',
    }),
    canceladaEn: timestamp('cancelada_en', { withTimezone: true }),
    ...marcasDeTiempo,
  },
  (tabla) => [
    check('reservas_rango_valido', sql`${tabla.comienzaEn} < ${tabla.terminaEn}`),
    check('reservas_montos_no_negativos', sql`${tabla.precioTotalCentavos} >= 0`),
    check(
      'reservas_senia_no_supera_precio',
      sql`${tabla.seniaTotalCentavos} >= 0 AND ${tabla.seniaTotalCentavos} <= ${tabla.precioTotalCentavos}`,
    ),
    // El canal declarado tiene que tener su dato cargado: si no, no hay por
    // dónde avisarle al cliente.
    check(
      'reservas_contacto_coherente',
      sql`
        ${tabla.canalContacto} IS NULL
        OR (${tabla.canalContacto} = 'whatsapp' AND ${tabla.contactoWhatsapp} IS NOT NULL)
        OR (${tabla.canalContacto} = 'email' AND ${tabla.contactoEmail} IS NOT NULL)
      `,
    ),
    // Los datos del cliente se exigen recién cuando la reserva llegó a existir
    // de verdad. Una retención que nadie completó expira sin haberlos tenido
    // nunca, y una cancelada durante la retención, tampoco.
    //
    // El canal de contacto **no** entra acá. La web siempre lo pide, pero un
    // turno cargado en el mostrador puede dejar sólo un nombre, y obligar a
    // inventar un número falso sería peor que aceptar que no hay por dónde
    // avisar. Que la web lo exija lo garantiza su contrato.
    check(
      'reservas_datos_completos_si_esta_activa',
      sql`
        ${tabla.estado} NOT IN ('confirmada', 'completada', 'ausente')
        OR (
          ${tabla.clienteNombre} IS NOT NULL
          AND ${tabla.aceptoCondicionesEn} IS NOT NULL
        )
      `,
    ),
    uniqueIndex('reservas_hash_token_unico').on(tabla.hashTokenGestion),
    index('reservas_sucursal_comienza').on(tabla.sucursalId, tabla.comienzaEn),
    index('reservas_estado_retencion').on(tabla.estado, tabla.retencionExpiraEn),
  ],
);

export const reservasServicios = pgTable(
  'reservas_servicios',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    reservaId: uuid('reserva_id')
      .notNull()
      .references(() => reservas.id, { onDelete: 'cascade' }),
    servicioId: uuid('servicio_id')
      .notNull()
      .references(() => servicios.id, { onDelete: 'restrict' }),
    profesionalId: uuid('profesional_id')
      .notNull()
      .references(() => profesionales.id, { onDelete: 'restrict' }),
    /** Posición del bloque dentro de la reserva, empezando en 0. */
    orden: smallint('orden').notNull(),

    // ── Franja que ve el cliente ───────────────────────────────────────────
    comienzaEn: timestamp('comienza_en', { withTimezone: true }).notNull(),
    terminaEn: timestamp('termina_en', { withTimezone: true }).notNull(),

    // ── Franja que ocupa la agenda ─────────────────────────────────────────
    // Incluye la preparación y la limpieza del servicio, que el cliente no ve.
    // Es la que usa la restricción de exclusión: dos bloques pueden verse
    // contiguos para el cliente y aun así pisarse por los buffers.
    ocupaDesde: timestamp('ocupa_desde', { withTimezone: true }).notNull(),
    ocupaHasta: timestamp('ocupa_hasta', { withTimezone: true }).notNull(),

    /**
     * Copia del estado de la reserva.
     *
     * Está desnormalizado a propósito: una restricción EXCLUDE sólo puede
     * filtrar por columnas de su propia tabla, y la exclusión tiene que aplicar
     * únicamente a los estados que ocupan la agenda. Lo mantiene sincronizado
     * un trigger; nunca se escribe a mano.
     */
    estado: estadoReserva('estado').notNull().default('pendiente_pago'),

    // ── Snapshots ──────────────────────────────────────────────────────────
    // Congelan las condiciones del momento de reservar. Cambiar el servicio
    // después no altera esta reserva.
    servicioNombre: text('servicio_nombre').notNull(),
    duracionMinutos: integer('duracion_minutos').notNull(),
    precioCentavos: integer('precio_centavos').notNull(),
    seniaCentavos: integer('senia_centavos').notNull().default(0),
    minutosPreparacion: integer('minutos_preparacion').notNull().default(0),
    minutosLimpieza: integer('minutos_limpieza').notNull().default(0),
    ...marcasDeTiempo,
  },
  (tabla) => [
    check('reservas_servicios_rango_valido', sql`${tabla.comienzaEn} < ${tabla.terminaEn}`),
    check('reservas_servicios_ocupacion_valida', sql`${tabla.ocupaDesde} < ${tabla.ocupaHasta}`),
    // La ventana ocupada tiene que contener a la que ve el cliente.
    check(
      'reservas_servicios_ocupacion_contiene_servicio',
      sql`${tabla.ocupaDesde} <= ${tabla.comienzaEn} AND ${tabla.ocupaHasta} >= ${tabla.terminaEn}`,
    ),
    check('reservas_servicios_precio_no_negativo', sql`${tabla.precioCentavos} >= 0`),
    uniqueIndex('reservas_servicios_orden_unico').on(tabla.reservaId, tabla.orden),
    index('reservas_servicios_profesional_ocupacion').on(tabla.profesionalId, tabla.ocupaDesde),
    index('reservas_servicios_reserva').on(tabla.reservaId),
  ],
);
