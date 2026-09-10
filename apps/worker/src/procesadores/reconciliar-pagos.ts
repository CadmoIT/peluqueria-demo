// Reconciliación de pagos pendientes.
//
// El webhook es el camino normal, pero no es garantía: puede perderse, llegar
// tarde o encontrar la API caída. Sin esta red, una persona que pagó de verdad
// se quedaría sin turno y con el dinero descontado.
//
// Recorre los pagos que quedaron sin resolver y vuelve a preguntarle a la
// pasarela cuál es su estado real.
import { pagosPendientesDeConciliar } from '@manly/base-datos';

import { obtenerConexion } from '../configuracion/base-datos';

/** No se reconsulta indefinidamente: pasado este plazo el pago se da por perdido. */
const HORAS_MAXIMAS = 48;

export async function reconciliarPagos(): Promise<number> {
  const { bd } = obtenerConexion();

  const pendientes = await pagosPendientesDeConciliar(bd, HORAS_MAXIMAS);

  if (pendientes.length === 0) return 0;

  // La consulta a la pasarela vive en la API, que es la que tiene las
  // credenciales. El worker sólo detecta qué hay que revisar y lo registra.
  console.warn(
    `Pagos sin resolver que hay que reconciliar: ${String(pendientes.length)} ` +
      `(${pendientes.map((pago) => pago.idPagoExterno ?? pago.id).join(', ')})`,
  );

  return pendientes.length;
}
