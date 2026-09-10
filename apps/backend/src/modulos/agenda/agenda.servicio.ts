// Agenda del panel: ver lo reservado, cargar turnos a mano y bloquear franjas.
//
// Dos cosas que valen para todo el archivo:
//
//   1. **Quien tiene rol `profesional` sólo ve lo suyo.** El filtro no se toma
//      del pedido sino de la sesión: si viniera del pedido, cambiar un
//      identificador en la URL alcanzaría para leer la agenda de cualquiera.
//   2. **Un bloqueo no cancela turnos.** Tapa la disponibilidad futura, nada
//      más. Los turnos que quedaron adentro se devuelven para que gerencia los
//      resuelva; borrárselos al cliente sin avisar sería peor que el problema.
import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import {
  agendaDeSucursal,
  borrarBloqueo,
  crearBloqueo,
  listarBloqueos,
  marcarAsistencia,
  reservasDentroDelRango,
  type BaseDatos,
  type BloqueDeAgenda,
} from '@manly/base-datos';
import type {
  BloqueAgenda,
  BloqueoCreado,
  ConsultaAgendaPanel,
  NuevoBloqueo,
  UsuarioSesion,
} from '@manly/contratos';

import { BASE_DATOS } from '../../comun/base-datos/base-datos.modulo';

/** Tope de la ventana consultable de una vez. Un mes cubre la vista mensual. */
const DIAS_MAXIMOS = 31;

@Injectable()
export class AgendaServicio {
  constructor(@Inject(BASE_DATOS) private readonly bd: BaseDatos) {}

  async consultar(consulta: ConsultaAgendaPanel, usuario: UsuarioSesion): Promise<BloqueAgenda[]> {
    const desde = new Date(consulta.desde);
    const hasta = new Date(consulta.hasta);

    if (desde >= hasta) {
      throw new BadRequestException('El rango tiene que terminar después de empezar.');
    }

    if (hasta.getTime() - desde.getTime() > DIAS_MAXIMOS * 86_400_000) {
      throw new BadRequestException(`La agenda se consulta de a ${String(DIAS_MAXIMOS)} días.`);
    }

    const bloques = await agendaDeSucursal(this.bd, {
      sucursalId: consulta.sucursalId,
      desde,
      hasta,
      profesionalId: this.limitarAProfesional(usuario, consulta.profesionalId),
      incluirCanceladas: consulta.incluirCanceladas ?? false,
    });

    return bloques.map((bloque) => this.aContrato(bloque, usuario));
  }

  /** Marca cómo terminó el turno. Sólo desde `confirmada`. */
  async marcarAsistencia(reservaId: string, estado: 'completada' | 'ausente'): Promise<boolean> {
    return marcarAsistencia(this.bd, reservaId, estado);
  }

  async crearBloqueo(pedido: NuevoBloqueo, usuario: UsuarioSesion): Promise<BloqueoCreado> {
    const comienzaEn = new Date(pedido.comienzaEn);
    const terminaEn = new Date(pedido.terminaEn);

    // Alguien con rol profesional sólo puede bloquearse a sí mismo. Si pudiera
    // bloquear la sucursal entera, cerraría el local por su cuenta.
    const profesionalId =
      usuario.rol === 'profesional' ? usuario.profesionalId : pedido.profesionalId;

    if (usuario.rol === 'profesional') {
      if (!usuario.profesionalId) {
        throw new ForbiddenException('Tu usuario todavía no está asociado a un profesional.');
      }

      if (pedido.profesionalId && pedido.profesionalId !== usuario.profesionalId) {
        throw new ForbiddenException('Sólo podés bloquear tu propia agenda.');
      }
    }

    const afectadas = await reservasDentroDelRango(this.bd, {
      sucursalId: pedido.sucursalId,
      profesionalId: profesionalId ?? null,
      desde: comienzaEn,
      hasta: terminaEn,
    });

    const id = await crearBloqueo(this.bd, {
      profesionalId: profesionalId ?? null,
      sucursalId: pedido.sucursalId,
      tipo: pedido.tipo,
      comienzaEn,
      terminaEn,
      motivo: pedido.motivo,
    });

    return {
      id,
      reservasAfectadas: afectadas.map((reserva) => ({
        reservaId: reserva.reservaId,
        clienteNombre: reserva.clienteNombre,
        comienzaEn: reserva.comienzaEn.toISOString(),
      })),
    };
  }

  async listarBloqueos(rango: { desde: string; hasta: string; sucursalId?: string }) {
    const bloqueos = await listarBloqueos(this.bd, {
      desde: new Date(rango.desde),
      hasta: new Date(rango.hasta),
      sucursalId: rango.sucursalId ?? null,
    });

    return bloqueos.map((bloqueo) => ({
      ...bloqueo,
      comienzaEn: bloqueo.comienzaEn.toISOString(),
      terminaEn: bloqueo.terminaEn.toISOString(),
    }));
  }

  async borrarBloqueo(id: string): Promise<boolean> {
    return borrarBloqueo(this.bd, id);
  }

  /**
   * A qué profesional se limita la consulta.
   *
   * Para el rol `profesional` sale de la sesión y no del pedido: es lo que
   * impide leer la agenda ajena cambiando un identificador en la URL.
   */
  private limitarAProfesional(usuario: UsuarioSesion, pedido: string | undefined): string | null {
    if (usuario.rol !== 'profesional') return pedido ?? null;

    if (!usuario.profesionalId) {
      throw new ForbiddenException('Tu usuario todavía no está asociado a un profesional.');
    }

    return usuario.profesionalId;
  }

  /**
   * Pasa el bloque al contrato, recortando lo que el rol no necesita ver.
   *
   * Un profesional necesita saber a quién atiende y a qué hora; el teléfono y
   * el correo del cliente son de gerencia, que es la que se comunica.
   */
  private aContrato(bloque: BloqueDeAgenda, usuario: UsuarioSesion): BloqueAgenda {
    const esGerencia = usuario.rol === 'gerencia';

    return {
      reservaId: bloque.reservaId,
      bloqueId: bloque.bloqueId,
      orden: bloque.orden,
      estado: bloque.estado,
      profesionalId: bloque.profesionalId,
      profesionalNombre: bloque.profesionalNombre,
      servicioNombre: bloque.servicioNombre,
      clienteNombre: bloque.clienteNombre,
      contactoWhatsapp: esGerencia ? bloque.contactoWhatsapp : null,
      contactoEmail: esGerencia ? bloque.contactoEmail : null,
      comienzaEn: bloque.comienzaEn.toISOString(),
      terminaEn: bloque.terminaEn.toISOString(),
      ocupaDesde: bloque.ocupaDesde.toISOString(),
      ocupaHasta: bloque.ocupaHasta.toISOString(),
      precioCentavos: bloque.precioCentavos,
      seniaCentavos: bloque.seniaCentavos,
      notas: bloque.notas,
      bloquesDeLaReserva: bloque.bloquesDeLaReserva,
    };
  }
}
