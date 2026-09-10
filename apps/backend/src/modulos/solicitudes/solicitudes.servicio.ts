// Resolución de las solicitudes de cambio.
//
// Llegan acá los pedidos que el cliente hizo cuando ya no le quedaba
// anticipación para cancelar o mover por su cuenta. Mientras están pendientes
// el horario original sigue ocupado.
//
// El orden de las operaciones es deliberado: **primero se aplica el cambio y
// recién después se marca la solicitud como resuelta**. Al revés, una
// reprogramación que fallara por horario tomado dejaría la solicitud cerrada y
// el turno sin mover, y nadie se enteraría.
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buscarReservaPorId,
  buscarSolicitud,
  contarSolicitudesPendientes,
  listarSolicitudes,
  resolverSolicitud,
  rotarTokenGestion,
  type BaseDatos,
  type EstadoSolicitud,
  type SolicitudDelPanel,
} from '@manly/base-datos';
import {
  esquemaBloqueElegido,
  type ResolucionSolicitud,
  type SolicitudPanel,
  type UsuarioSesion,
} from '@manly/contratos';
import { z } from 'zod';

import { BASE_DATOS } from '../../comun/base-datos/base-datos.modulo';
import { NotificacionesServicio } from '../notificaciones/notificaciones.servicio';
import { ReservasServicio } from '../reservas/reservas.servicio';

/**
 * La propuesta viaja como JSON libre en la base.
 *
 * Se revalida al leerla, no sólo al escribirla: entre que el cliente la mandó y
 * que gerencia la aprueba pueden pasar días, y lo que hay guardado es un `jsonb`
 * que nada garantiza que siga teniendo la forma esperada.
 */
const esquemaPropuesta = z.array(esquemaBloqueElegido).min(1).max(4);

@Injectable()
export class SolicitudesServicio {
  constructor(
    @Inject(BASE_DATOS) private readonly bd: BaseDatos,
    private readonly reservas: ReservasServicio,
    private readonly notificaciones: NotificacionesServicio,
  ) {}

  async listar(filtros: {
    estado?: EstadoSolicitud;
    sucursalId?: string;
  }): Promise<SolicitudPanel[]> {
    const solicitudes = await listarSolicitudes(this.bd, filtros);

    return solicitudes.map((solicitud) => this.aContrato(solicitud));
  }

  async pendientes(): Promise<number> {
    return contarSolicitudesPendientes(this.bd);
  }

  /**
   * Aplica la decisión de gerencia.
   *
   * Aprobar una cancelación cancela el turno; aprobar una reprogramación lo
   * mueve al horario que el cliente propuso, revalidando los bloques. Rechazar
   * no toca la reserva: el turno original sigue en pie.
   */
  async resolver(
    id: string,
    decision: ResolucionSolicitud,
    usuario: UsuarioSesion,
  ): Promise<{ resultado: 'aprobada' | 'rechazada'; mensaje: string }> {
    const solicitud = await buscarSolicitud(this.bd, id);

    if (!solicitud) {
      throw new NotFoundException('No encontramos esa solicitud.');
    }

    if (solicitud.estado !== 'pendiente') {
      throw new ConflictException('Esa solicitud ya fue resuelta.');
    }

    const aprobada = decision.decision === 'aprobar';

    if (aprobada) {
      await this.aplicar(solicitud);
    }

    // Recién ahora se cierra. La condición de que siga pendiente vive en la
    // propia sentencia, así que si dos personas la resuelven a la vez, la
    // segunda se entera de que llegó tarde.
    const cerrada = await resolverSolicitud(this.bd, {
      id,
      estado: aprobada ? 'aprobada' : 'rechazada',
      respuesta: decision.respuesta,
      usuarioId: usuario.id,
    });

    if (!cerrada) {
      throw new ConflictException('Otra persona resolvió esta solicitud recién.');
    }

    await this.avisar(solicitud.reservaId, aprobada);

    return {
      resultado: aprobada ? 'aprobada' : 'rechazada',
      mensaje: aprobada ? 'Solicitud aprobada y aplicada.' : 'Solicitud rechazada.',
    };
  }

  // ── Interno ────────────────────────────────────────────────────────────────

  private async aplicar(solicitud: SolicitudDelPanel): Promise<void> {
    if (solicitud.tipo === 'cancelacion') {
      await this.reservas.cancelarPorGerencia(solicitud.reservaId);

      return;
    }

    const propuesta = esquemaPropuesta.safeParse(solicitud.propuesta);

    if (!propuesta.success) {
      throw new BadRequestException(
        'La solicitud no trae un horario nuevo válido. Reprogramá el turno a mano.',
      );
    }

    await this.reservas.reprogramarPorGerencia(solicitud.reservaId, propuesta.data);
  }

  /**
   * Avisa la resolución.
   *
   * Emite un enlace de gestión nuevo porque el original no se puede
   * reconstruir: en la base sólo está su hash. El viejo deja de servir, pero el
   * nuevo va en el mismo mensaje.
   */
  private async avisar(reservaId: string, aprobada: boolean): Promise<void> {
    const reserva = await buscarReservaPorId(this.bd, reservaId);

    if (!reserva) return;

    const token = await rotarTokenGestion(this.bd, reservaId);

    if (!token) return;

    await this.notificaciones.alResolverSolicitud(reserva, token, aprobada);
  }

  private aContrato(solicitud: SolicitudDelPanel): SolicitudPanel {
    return {
      id: solicitud.id,
      tipo: solicitud.tipo,
      estado: solicitud.estado,
      motivo: solicitud.motivo,
      propuesta: solicitud.propuesta,
      respuesta: solicitud.respuesta,
      resueltaPor: solicitud.resueltaPor,
      resueltaEn: solicitud.resueltaEn?.toISOString() ?? null,
      creadoEn: solicitud.creadoEn.toISOString(),
      reservaId: solicitud.reservaId,
      reservaEstado: solicitud.reservaEstado,
      clienteNombre: solicitud.clienteNombre,
      comienzaEn: solicitud.comienzaEn.toISOString(),
      terminaEn: solicitud.terminaEn.toISOString(),
      seniaTotalCentavos: solicitud.seniaTotalCentavos,
      sucursalId: solicitud.sucursalId,
      sucursalNombre: solicitud.sucursalNombre,
    };
  }
}
