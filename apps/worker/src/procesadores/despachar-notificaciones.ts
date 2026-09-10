// Despacha la bandeja de salida de notificaciones.
//
// Es el único lugar del sistema que manda mensajes. La API sólo encola.
//
// Deja además el latido del worker: la API corre en otro servicio y no tiene
// forma de saber si este proceso sigue tomando trabajo ni si sus canales son
// reales o simulados. Lo segundo es lo peligroso —el simulador registra los
// envíos como exitosos—, y sin este rastro se descubre cuando un cliente avisa
// que nunca le llegó nada.
import { registrarLatido } from '@manly/base-datos';

import { despacharPendientes } from '../notificaciones/despachador';
import { crearCanales, type Canales } from '../notificaciones/canales/index';
import { obtenerConexion } from '../configuracion/base-datos';
import { leerEntorno } from '../configuracion/entorno';

let canales: Canales | null = null;

export async function despacharNotificaciones(): Promise<number> {
  const { bd } = obtenerConexion();
  const entorno = leerEntorno();

  canales ??= crearCanales(entorno);

  await registrarLatido(bd, {
    canalWhatsapp: entorno.WHATSAPP_TOKEN && entorno.WHATSAPP_ID_TELEFONO ? 'real' : 'simulado',
    canalEmail: entorno.RESEND_API_KEY && entorno.EMAIL_REMITENTE ? 'real' : 'simulado',
    version: process.env.npm_package_version,
  });

  const resumen = await despacharPendientes(bd, canales);

  if (resumen.enviadas > 0 || resumen.fallidas > 0 || resumen.conRespaldo > 0) {
    console.warn(
      `Notificaciones: ${String(resumen.enviadas)} enviadas, ` +
        `${String(resumen.reintentar)} a reintentar, ` +
        `${String(resumen.conRespaldo)} pasadas al canal de respaldo, ` +
        `${String(resumen.fallidas)} fallidas.`,
    );
  }

  return resumen.enviadas;
}
