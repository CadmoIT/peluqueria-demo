// Despacho de la bandeja de salida.
//
// Toma las notificaciones cuyo momento llegó, arma el mensaje y lo manda por su
// canal. Tres comportamientos que importan:
//
//   - **Un fallo pasajero se reintenta** con esperas crecientes. Una caída del
//     proveedor no debe perder el aviso.
//   - **Un fallo definitivo no se reintenta.** Un número que no existe no va a
//     empezar a existir: insistir sólo retrasa el aviso al local.
//   - **Si el canal elegido se agota y hay otro dato de contacto, se prueba por
//     ahí.** Es la última chance antes de dar la reserva por incomunicada.
import {
  contactosDeReserva,
  marcarEnviada,
  marcarFallida,
  notificacionesPendientes,
  registrarFalloYReprogramar,
  encolarNotificacion,
  yaSeIntentoPorCanal,
  type BaseDatos,
  type CanalNotificacion,
  type NotificacionEnCola,
} from '@manly/base-datos';

import type { Canal } from './canales/canal';
import { armarMensaje, type DatosMensaje, type TipoMensaje } from './plantillas';

export interface Canales {
  whatsapp: Canal;
  email: Canal;
}

export interface ResumenDespacho {
  enviadas: number;
  reintentar: number;
  fallidas: number;
  /** Notificaciones que se pasaron al canal de respaldo. */
  conRespaldo: number;
}

/** El otro canal, para el respaldo. */
function canalAlternativo(canal: CanalNotificacion): CanalNotificacion {
  return canal === 'whatsapp' ? 'email' : 'whatsapp';
}

/**
 * Despacha lo que haya pendiente.
 *
 * Devuelve el resumen para poder registrarlo: si el número de fallidas empieza
 * a crecer, hay algo roto en un proveedor.
 */
export async function despacharPendientes(
  bd: BaseDatos,
  canales: Canales,
  limite = 50,
): Promise<ResumenDespacho> {
  const pendientes = await notificacionesPendientes(bd, limite);
  const resumen: ResumenDespacho = { enviadas: 0, reintentar: 0, fallidas: 0, conRespaldo: 0 };

  for (const notificacion of pendientes) {
    const resultado = await despacharUna(bd, canales, notificacion);

    if (resultado === 'enviada') resumen.enviadas += 1;
    if (resultado === 'reintentar') resumen.reintentar += 1;
    if (resultado === 'fallida') resumen.fallidas += 1;
    if (resultado === 'respaldo') resumen.conRespaldo += 1;
  }

  return resumen;
}

type ResultadoUna = 'enviada' | 'reintentar' | 'fallida' | 'respaldo';

async function despacharUna(
  bd: BaseDatos,
  canales: Canales,
  notificacion: NotificacionEnCola,
): Promise<ResultadoUna> {
  let mensaje;

  try {
    mensaje = armarMensaje(notificacion.tipo as TipoMensaje, notificacion.datos as DatosMensaje);
  } catch (error: unknown) {
    // Una plantilla que no existe o datos incompletos no se arreglan
    // reintentando: es un error del sistema, no del proveedor.
    await marcarFallida(
      bd,
      notificacion.id,
      error instanceof Error ? error.message : 'No se pudo armar el mensaje.',
    );

    return 'fallida';
  }

  const canal = canales[notificacion.canal];
  const resultado = await canal.enviar(notificacion.destino, mensaje);

  if (resultado.ok) {
    await marcarEnviada(bd, notificacion.id);

    return 'enviada';
  }

  // Un fallo definitivo no gasta más intentos: se agota de una.
  if (!resultado.reintentable) {
    await marcarFallida(bd, notificacion.id, resultado.error);

    return (await intentarRespaldo(bd, notificacion)) ? 'respaldo' : 'fallida';
  }

  const { agotada } = await registrarFalloYReprogramar(
    bd,
    notificacion.id,
    notificacion.intentos,
    resultado.error,
  );

  if (!agotada) return 'reintentar';

  return (await intentarRespaldo(bd, notificacion)) ? 'respaldo' : 'fallida';
}

/**
 * Reencola la notificación por el otro canal, si hay otro dato de contacto.
 *
 * Devuelve si se pudo. Cuando no, la notificación queda fallida y aparece en la
 * vista de fallos operativos para que alguien del local llame por teléfono.
 */
async function intentarRespaldo(bd: BaseDatos, notificacion: NotificacionEnCola): Promise<boolean> {
  if (!notificacion.reservaId) return false;

  const alternativo = canalAlternativo(notificacion.canal);

  // Corta el bucle: si por el otro canal ya se intentó, este aviso se acabó.
  // Sin esto, dos canales que fallan se reencolarían el uno al otro para
  // siempre.
  if (await yaSeIntentoPorCanal(bd, notificacion.reservaId, notificacion.tipo, alternativo)) {
    return false;
  }

  const contactos = await contactosDeReserva(bd, notificacion.reservaId);
  const destino = alternativo === 'whatsapp' ? contactos.whatsapp : contactos.email;

  if (!destino) return false;

  // El respaldo sale ya mismo: el aviso original ya se demoró bastante.
  await encolarNotificacion(bd, {
    reservaId: notificacion.reservaId,
    tipo: notificacion.tipo,
    canal: alternativo,
    destino,
    plantilla: notificacion.plantilla,
    datos: notificacion.datos,
    programadaPara: new Date(),
  });

  return true;
}
