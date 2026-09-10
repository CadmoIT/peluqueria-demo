// Bandeja de salida de notificaciones.
//
// Nada se envía en línea. Todo se encola acá y lo despacha el worker, por dos
// razones:
//
//   1. Una caída de WhatsApp o de Resend no debe hacer fallar una reserva. El
//      turno se confirma igual y el aviso sale cuando el proveedor vuelva.
//   2. Queda registro de qué se intentó mandar, cuántas veces y qué pasó. Sin
//      eso, "no me llegó el recordatorio" es imposible de investigar.
//
// Los datos del mensaje se copian al encolar. Si después cambia el precio de un
// servicio o el nombre de un profesional, el recordatorio sigue diciendo lo que
// se le prometió al cliente.
import { and, asc, eq, inArray, lte, ne, sql } from 'drizzle-orm';

import type { BaseDatos } from '../conexion';
import { notificaciones, reservas } from '../esquemas/index';

export type TipoNotificacion =
  | 'confirmacion'
  | 'recordatorio_primero'
  | 'recordatorio_segundo'
  | 'cancelacion'
  | 'reprogramacion'
  | 'solicitud_aprobada'
  | 'solicitud_rechazada';

export type CanalNotificacion = 'whatsapp' | 'email';

export interface NotificacionEnCola {
  id: string;
  reservaId: string | null;
  tipo: TipoNotificacion;
  canal: CanalNotificacion;
  destino: string;
  plantilla: string;
  datos: unknown;
  intentos: number;
  programadaPara: Date;
}

/**
 * Intentos antes de dar por perdido un canal.
 *
 * Con tres alcanza para atravesar una caída pasajera del proveedor. Insistir
 * más sobre un número que no existe sólo retrasa el aviso a gerencia.
 */
export const MAXIMO_INTENTOS = 3;

/** Espera antes del siguiente intento, creciente. */
export function esperaDelIntento(intentos: number): number {
  // 1 minuto, 5 minutos, 15 minutos.
  const minutos = [1, 5, 15];

  return (minutos[Math.min(intentos, minutos.length - 1)] ?? 15) * 60_000;
}

export interface DatosAEncolar {
  reservaId: string | null;
  tipo: TipoNotificacion;
  canal: CanalNotificacion;
  destino: string;
  plantilla: string;
  datos: unknown;
  /** Cuándo corresponde enviarla. Los recordatorios se encolan con futuro. */
  programadaPara: Date;
  /**
   * La deja preparada pero sin enviar, esperando un evento.
   *
   * Se usa cuando la reserva lleva seña: el aviso se arma mientras se tiene el
   * token del enlace —que en la base sólo existe hasheado— y se libera recién
   * cuando el pago se acredita. Sin esto, el webhook no tendría forma de
   * reconstruir el enlace de gestión.
   */
  retenida?: boolean;
}

/** Pone una notificación en la bandeja de salida. */
export async function encolarNotificacion(bd: BaseDatos, datos: DatosAEncolar): Promise<string> {
  const [creada] = await bd
    .insert(notificaciones)
    .values({
      reservaId: datos.reservaId,
      tipo: datos.tipo,
      canal: datos.canal,
      destino: datos.destino,
      plantilla: datos.plantilla,
      datos: datos.datos,
      programadaPara: datos.programadaPara,
      estado: datos.retenida ? 'retenida' : 'pendiente',
    })
    .returning({ id: notificaciones.id });

  if (!creada) {
    throw new Error('No se pudo encolar la notificación.');
  }

  return creada.id;
}

/**
 * Notificaciones listas para enviar.
 *
 * Son las pendientes cuyo momento ya llegó. Los recordatorios programados a
 * futuro quedan afuera hasta que corresponda.
 */
export async function notificacionesPendientes(
  bd: BaseDatos,
  limite = 50,
): Promise<NotificacionEnCola[]> {
  return bd
    .select({
      id: notificaciones.id,
      reservaId: notificaciones.reservaId,
      tipo: notificaciones.tipo,
      canal: notificaciones.canal,
      destino: notificaciones.destino,
      plantilla: notificaciones.plantilla,
      datos: notificaciones.datos,
      intentos: notificaciones.intentos,
      programadaPara: notificaciones.programadaPara,
    })
    .from(notificaciones)
    .where(
      and(eq(notificaciones.estado, 'pendiente'), lte(notificaciones.programadaPara, sql`now()`)),
    )
    .orderBy(asc(notificaciones.programadaPara))
    .limit(limite);
}

export async function marcarEnviada(bd: BaseDatos, id: string): Promise<void> {
  await bd
    .update(notificaciones)
    .set({
      estado: 'enviada',
      enviadaEn: new Date(),
      intentos: sql`${notificaciones.intentos} + 1`,
      ultimoError: null,
      actualizadoEn: new Date(),
    })
    .where(eq(notificaciones.id, id));
}

/**
 * Deja la notificación lista para reintentar más tarde.
 *
 * Suma un intento y corre la fecha. Si ya agotó los intentos la deja fallida,
 * que es lo que después levanta la alerta a gerencia.
 */
export async function registrarFalloYReprogramar(
  bd: BaseDatos,
  id: string,
  intentosPrevios: number,
  error: string,
): Promise<{ agotada: boolean }> {
  const intentos = intentosPrevios + 1;
  const agotada = intentos >= MAXIMO_INTENTOS;

  await bd
    .update(notificaciones)
    .set({
      estado: agotada ? 'fallida' : 'pendiente',
      intentos,
      ultimoError: error.slice(0, 500),
      programadaPara: agotada
        ? undefined
        : new Date(Date.now() + esperaDelIntento(intentosPrevios)),
      actualizadoEn: new Date(),
    })
    .where(eq(notificaciones.id, id));

  return { agotada };
}

/** Marca una notificación como fallida sin más intentos. */
export async function marcarFallida(bd: BaseDatos, id: string, error: string): Promise<void> {
  await bd
    .update(notificaciones)
    .set({
      estado: 'fallida',
      intentos: sql`${notificaciones.intentos} + 1`,
      ultimoError: error.slice(0, 500),
      actualizadoEn: new Date(),
    })
    .where(eq(notificaciones.id, id));
}

/**
 * Descarta las notificaciones que ya no tienen sentido.
 *
 * Se usa al cancelar o reprogramar: mandar el recordatorio de un turno que ya
 * no existe es peor que no mandar nada.
 */
export async function descartarPendientesDeReserva(
  bd: BaseDatos,
  reservaId: string,
  tipos: TipoNotificacion[],
): Promise<number> {
  if (tipos.length === 0) return 0;

  const descartadas = await bd
    .update(notificaciones)
    .set({ estado: 'descartada', actualizadoEn: new Date() })
    .where(
      and(
        eq(notificaciones.reservaId, reservaId),
        eq(notificaciones.estado, 'pendiente'),
        inArray(notificaciones.tipo, tipos),
      ),
    )
    .returning({ id: notificaciones.id });

  return descartadas.length;
}

/**
 * Libera las notificaciones que estaban esperando el pago.
 *
 * Las pasa a pendiente, con lo que la bandeja las toma en la próxima corrida.
 * Los recordatorios conservan su fecha futura.
 */
export async function liberarRetenidasDeReserva(bd: BaseDatos, reservaId: string): Promise<number> {
  const liberadas = await bd
    .update(notificaciones)
    .set({ estado: 'pendiente', actualizadoEn: new Date() })
    .where(and(eq(notificaciones.reservaId, reservaId), eq(notificaciones.estado, 'retenida')))
    .returning({ id: notificaciones.id });

  return liberadas.length;
}

/**
 * Descarta las retenidas de una reserva que no llegó a pagarse.
 *
 * Se llama al expirar: un aviso preparado para un turno que ya se liberó no
 * debe salir nunca.
 */
export async function descartarRetenidasDeReserva(
  bd: BaseDatos,
  reservaIds: string[],
): Promise<number> {
  if (reservaIds.length === 0) return 0;

  const descartadas = await bd
    .update(notificaciones)
    .set({ estado: 'descartada', actualizadoEn: new Date() })
    .where(
      and(
        inArray(notificaciones.reservaId, reservaIds),
        inArray(notificaciones.estado, ['retenida', 'pendiente']),
      ),
    )
    .returning({ id: notificaciones.id });

  return descartadas.length;
}

/** Los datos de contacto de una reserva, para poder elegir un respaldo. */
export async function contactosDeReserva(
  bd: BaseDatos,
  reservaId: string,
): Promise<{
  whatsapp: string | null;
  email: string | null;
  canalElegido: CanalNotificacion | null;
}> {
  const [fila] = await bd
    .select({
      whatsapp: reservas.contactoWhatsapp,
      email: reservas.contactoEmail,
      canalElegido: reservas.canalContacto,
    })
    .from(reservas)
    .where(eq(reservas.id, reservaId))
    .limit(1);

  return fila ?? { whatsapp: null, email: null, canalElegido: null };
}

/**
 * Notificaciones que agotaron sus intentos y nadie resolvió.
 *
 * Es la vista de fallos operativos: turnos cuyo aviso no llegó y que alguien
 * del local tiene que atender a mano.
 */
export async function notificacionesFallidas(
  bd: BaseDatos,
  limite = 100,
): Promise<NotificacionEnCola[]> {
  return bd
    .select({
      id: notificaciones.id,
      reservaId: notificaciones.reservaId,
      tipo: notificaciones.tipo,
      canal: notificaciones.canal,
      destino: notificaciones.destino,
      plantilla: notificaciones.plantilla,
      datos: notificaciones.datos,
      intentos: notificaciones.intentos,
      programadaPara: notificaciones.programadaPara,
    })
    .from(notificaciones)
    .where(eq(notificaciones.estado, 'fallida'))
    .orderBy(asc(notificaciones.programadaPara))
    .limit(limite);
}

/**
 * Si ya se intentó esta notificación por un canal.
 *
 * Es lo que corta el bucle del respaldo: sin esta comprobación, un canal que
 * falla definitivamente reencolaría por el otro, y ese otro de vuelta por el
 * primero, indefinidamente.
 *
 * Las descartadas no cuentan: se descartaron justamente para volver a encolar.
 */
export async function yaSeIntentoPorCanal(
  bd: BaseDatos,
  reservaId: string,
  tipo: TipoNotificacion,
  canal: CanalNotificacion,
): Promise<boolean> {
  const [existente] = await bd
    .select({ id: notificaciones.id })
    .from(notificaciones)
    .where(
      and(
        eq(notificaciones.reservaId, reservaId),
        eq(notificaciones.tipo, tipo),
        eq(notificaciones.canal, canal),
        ne(notificaciones.estado, 'descartada'),
      ),
    )
    .limit(1);

  return existente !== undefined;
}
