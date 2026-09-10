// Despacha la bandeja de salida de notificaciones.
//
// Es el único lugar del sistema que manda mensajes. La API sólo encola.
import { despacharPendientes } from '../notificaciones/despachador';
import { crearCanales, type Canales } from '../notificaciones/canales/index';
import { obtenerConexion } from '../configuracion/base-datos';
import { leerEntorno } from '../configuracion/entorno';

let canales: Canales | null = null;

export async function despacharNotificaciones(): Promise<number> {
  const { bd } = obtenerConexion();

  canales ??= crearCanales(leerEntorno());

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
