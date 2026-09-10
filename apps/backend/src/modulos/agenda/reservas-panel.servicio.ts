// Reservas vistas y manejadas desde el panel.
//
// Se apoya en `ReservasServicio`, que es el que sabe validar bloques: cargar un
// turno a mano usa exactamente el mismo camino que la web —mismos precios,
// mismos buffers, misma restricción de exclusión—, así que desde el panel
// tampoco se puede pisar un turno ajeno ni inventar un horario fuera de agenda.
//
// El aviso al cliente necesita un enlace de gestión, y el original no se puede
// reconstruir porque en la base sólo vive su hash. Por eso se emite uno nuevo
// antes de avisar; el enlace viejo deja de servir, pero el nuevo va dentro del
// mismo mensaje.
import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  buscarReservaPorId,
  pagosDeReserva,
  rotarTokenGestion,
  totalCobrado,
  type BaseDatos,
} from '@manly/base-datos';
import type { ReservaDetallePanel, ReservaManual, UsuarioSesion } from '@manly/contratos';

import { BASE_DATOS } from '../../comun/base-datos/base-datos.modulo';
import { NotificacionesServicio } from '../notificaciones/notificaciones.servicio';
import { ReservasServicio } from '../reservas/reservas.servicio';

@Injectable()
export class ReservasPanelServicio {
  constructor(
    @Inject(BASE_DATOS) private readonly bd: BaseDatos,
    private readonly reservas: ReservasServicio,
    private readonly notificaciones: NotificacionesServicio,
  ) {}

  async detalle(reservaId: string, usuario: UsuarioSesion): Promise<ReservaDetallePanel> {
    const reserva = await buscarReservaPorId(this.bd, reservaId);

    if (!reserva) {
      throw new NotFoundException('No encontramos esa reserva.');
    }

    // El dinero es asunto de gerencia. Un profesional ve su agenda, no la caja.
    const esGerencia = usuario.rol === 'gerencia';
    const pagos = esGerencia ? await pagosDeReserva(this.bd, reservaId) : [];

    return {
      id: reserva.id,
      estado: reserva.estado,
      sucursalId: reserva.sucursal.id,
      sucursalNombre: reserva.sucursal.nombre,
      clienteNombre: reserva.clienteNombre,
      canalContacto: reserva.canalContacto,
      contactoWhatsapp: esGerencia ? reserva.contactoWhatsapp : null,
      contactoEmail: esGerencia ? reserva.contactoEmail : null,
      comienzaEn: reserva.comienzaEn.toISOString(),
      terminaEn: reserva.terminaEn.toISOString(),
      precioTotalCentavos: reserva.precioTotalCentavos,
      seniaTotalCentavos: reserva.seniaTotalCentavos,
      cobradoCentavos: esGerencia ? await totalCobrado(this.bd, reservaId) : 0,
      bloques: reserva.bloques.map((bloque) => ({
        orden: bloque.orden,
        servicioNombre: bloque.servicioNombre,
        profesionalNombre: bloque.profesionalNombre,
        comienzaEn: bloque.comienzaEn.toISOString(),
        terminaEn: bloque.terminaEn.toISOString(),
        precioCentavos: bloque.precioCentavos,
      })),
      pagos: pagos.map((pago) => ({
        id: pago.id,
        tipo: pago.tipo,
        medio: pago.medio,
        estado: pago.estado,
        montoCentavos: pago.montoCentavos,
        acreditadoEn: pago.acreditadoEn?.toISOString() ?? null,
        creadoEn: pago.creadoEn.toISOString(),
      })),
    };
  }

  async crearManual(pedido: ReservaManual, usuario: UsuarioSesion): Promise<{ reservaId: string }> {
    if (usuario.rol !== 'gerencia') {
      throw new ForbiddenException('Sólo gerencia puede cargar turnos a mano.');
    }

    const { reservaId } = await this.reservas.crearManual(pedido, usuario.id);

    return { reservaId };
  }

  /** Cancela por decisión del local y avisa si hay por dónde. */
  async cancelar(reservaId: string): Promise<{ avisado: boolean }> {
    const reserva = await this.reservas.cancelarPorGerencia(reservaId);

    const token = await rotarTokenGestion(this.bd, reserva.id);

    if (!token) return { avisado: false };

    await this.notificaciones.alCancelar(reserva, token);

    // Sin canal de contacto no hay a quién avisarle: pasa con los turnos que se
    // cargaron por teléfono dejando sólo un nombre.
    return { avisado: reserva.contactoWhatsapp !== null || reserva.contactoEmail !== null };
  }
}
