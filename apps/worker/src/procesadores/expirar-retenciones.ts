// Libera los horarios de las retenciones vencidas.
//
// Una selección retiene los bloques diez minutos. Si el pago no se aprueba en
// ese plazo, la reserva pasa a `expirada` y el trigger de la base propaga el
// estado a los bloques, que dejan de contar para la restricción de exclusión.
//
// El motor de disponibilidad ya ignora las retenciones vencidas al calcular,
// así que un retraso de este trabajo no le muestra horarios ocupados a nadie:
// esto es lo que deja la base ordenada.
import { expirarRetencionesVencidas } from '@manly/base-datos';

import { obtenerConexion } from '../configuracion/base-datos';

export async function expirarRetenciones(): Promise<number> {
  const { bd } = obtenerConexion();
  const expiradas = await expirarRetencionesVencidas(bd);

  if (expiradas.length > 0) {
    console.warn(`Retenciones expiradas: ${String(expiradas.length)}`);
  }

  return expiradas.length;
}
