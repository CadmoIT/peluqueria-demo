// Libera los horarios de las retenciones vencidas.
//
// Una selección retiene los bloques diez minutos. Si el pago no se aprueba en
// ese plazo, la reserva pasa a `expirada` y el trigger de la base propaga el
// estado a los bloques, que dejan de contar para la restricción de exclusión.
//
// El motor de disponibilidad ya ignora las retenciones vencidas al calcular,
// así que un retraso de este trabajo no le muestra horarios ocupados a nadie:
// esto es lo que deja la base ordenada.
import { descartarRetenidasDeReserva, expirarRetencionesVencidas } from '@manly/base-datos';

import { obtenerConexion } from '../configuracion/base-datos';

export async function expirarRetenciones(): Promise<number> {
  const { bd } = obtenerConexion();
  const expiradas = await expirarRetencionesVencidas(bd);

  if (expiradas.length > 0) {
    // Los avisos que estaban preparados esperando el pago ya no tienen sentido:
    // el turno se liberó. Mandarlos diría que el turno está confirmado cuando
    // ya no existe.
    const descartadas = await descartarRetenidasDeReserva(bd, expiradas);

    console.warn(
      `Retenciones expiradas: ${String(expiradas.length)}. ` +
        `Avisos descartados: ${String(descartadas)}.`,
    );
  }

  return expiradas.length;
}
