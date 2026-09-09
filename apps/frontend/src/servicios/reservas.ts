// Llamadas del flujo de reserva y de la gestión sin cuenta.
import type {
  BusquedaDisponibilidad,
  PedidoConfirmacion,
  PedidoRetencion,
  RespuestaDisponibilidad,
  ReservaPublica,
  ResultadoGestion,
  Retencion,
} from '@manly/contratos';

import { consultarApi } from './api';

export function buscarDisponibilidad(
  pedido: BusquedaDisponibilidad,
): Promise<RespuestaDisponibilidad> {
  return consultarApi<RespuestaDisponibilidad>('/disponibilidad/buscar', {
    method: 'POST',
    body: JSON.stringify(pedido),
  });
}

export function retenerHorario(pedido: PedidoRetencion): Promise<Retencion> {
  return consultarApi<Retencion>('/reservas/retener', {
    method: 'POST',
    body: JSON.stringify(pedido),
  });
}

export function confirmarReserva(pedido: PedidoConfirmacion): Promise<ReservaPublica> {
  return consultarApi<ReservaPublica>('/reservas', {
    method: 'POST',
    body: JSON.stringify(pedido),
  });
}

export function consultarReserva(token: string): Promise<ReservaPublica> {
  return consultarApi<ReservaPublica>(`/mi-reserva/${encodeURIComponent(token)}`);
}

export function cancelarReserva(token: string, motivo?: string): Promise<ResultadoGestion> {
  return consultarApi<ResultadoGestion>(`/mi-reserva/${encodeURIComponent(token)}/cancelar`, {
    method: 'POST',
    body: JSON.stringify({ motivo }),
  });
}
