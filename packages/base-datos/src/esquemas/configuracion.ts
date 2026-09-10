// Configuración global del negocio. Una sola fila, editable desde el panel.
//
// Los valores de acá son los que rigen cuando una sucursal o un servicio no
// definen el suyo propio.
import { sql } from 'drizzle-orm';
import { boolean, check, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { marcasDeTiempo } from './comunes';

export const configuracionNegocio = pgTable(
  'configuracion_negocio',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /**
     * Fuerza que exista una única fila: la columna sólo admite `true` y es
     * única, así que un segundo INSERT falla.
     */
    filaUnica: boolean('fila_unica').notNull().default(true),

    /** Anticipación mínima para cancelar o reprogramar sin pasar por gerencia. */
    horasMinimasCancelacion: integer('horas_minimas_cancelacion').notNull().default(24),
    /** Cuánto retiene los bloques una selección sin pagar. */
    minutosRetencion: integer('minutos_retencion').notNull().default(10),
    /** Hasta cuántos días hacia adelante se muestra disponibilidad. */
    diasHorizonte: integer('dias_horizonte').notNull().default(60),
    /** Cuántos servicios admite una misma reserva. */
    maximoServiciosPorReserva: integer('maximo_servicios_por_reserva').notNull().default(4),

    /** Horas antes del turno para el primer recordatorio. */
    horasRecordatorioPrimero: integer('horas_recordatorio_primero').notNull().default(24),
    /** Horas antes del turno para el segundo. En null no se manda. */
    horasRecordatorioSegundo: integer('horas_recordatorio_segundo').default(2),

    zonaHoraria: text('zona_horaria').notNull().default('America/Argentina/Buenos_Aires'),

    /**
     * Si el sitio acepta reservas nuevas.
     *
     * Existe para el día del corte y para el día que algo salga mal. Apagarlo
     * no toca nada de lo ya reservado: los turnos siguen, el enlace de gestión
     * sigue funcionando y el panel sigue pudiendo cargar a mano. Lo único que
     * deja de andar es tomar turnos nuevos desde la web.
     *
     * La alternativa —bajar el sitio— cancela de hecho la atención al cliente
     * de quien ya tenía turno y necesita moverlo.
     */
    reservasOnlineActivas: boolean('reservas_online_activas').notNull().default(true),
    /** Qué se le muestra a quien entra a reservar mientras está apagado. */
    mensajeReservasCerradas: text('mensaje_reservas_cerradas'),
    ...marcasDeTiempo,
  },
  (tabla) => [
    // El CHECK sola no alcanza: hace falta el indice unico para que un segundo
    // INSERT falle. La combinacion deja exactamente una fila posible.
    check('configuracion_fila_unica_es_true', sql`${tabla.filaUnica} = true`),
    uniqueIndex('configuracion_fila_unica').on(tabla.filaUnica),
    check('configuracion_retencion_positiva', sql`${tabla.minutosRetencion} > 0`),
    check('configuracion_horizonte_positivo', sql`${tabla.diasHorizonte} > 0`),
    check('configuracion_maximo_servicios', sql`${tabla.maximoServiciosPorReserva} > 0`),
    check(
      'configuracion_horas_no_negativas',
      sql`
        ${tabla.horasMinimasCancelacion} >= 0
        AND ${tabla.horasRecordatorioPrimero} >= 0
        AND (${tabla.horasRecordatorioSegundo} IS NULL OR ${tabla.horasRecordatorioSegundo} >= 0)
      `,
    ),
  ],
);
