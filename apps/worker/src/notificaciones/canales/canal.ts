// Contrato común de los canales de notificación.
//
// WhatsApp y email se usan igual desde el despachador: sólo cambian el
// adaptador y el destino. Eso permite el respaldo entre canales sin lógica
// especial, y correr todo sin credenciales.
import type { MensajeArmado } from '../plantillas';

/**
 * Resultado de un envío.
 *
 * La diferencia entre `reintentable` y definitivo es la que decide qué hacer:
 * una caída del proveedor se reintenta, un número que no existe no. Insistir
 * sobre un destino inválido sólo retrasa el aviso a gerencia.
 */
export type ResultadoEnvio =
  { ok: true; idExterno: string | null } | { ok: false; error: string; reintentable: boolean };

export interface Canal {
  /** Nombre para el registro. */
  readonly nombre: string;

  enviar(destino: string, mensaje: MensajeArmado): Promise<ResultadoEnvio>;
}
