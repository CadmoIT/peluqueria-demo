// Flujo de reserva y gestión sin cuenta.
//
// El cliente elige una opción de la búsqueda y la manda de vuelta. **Nada de
// eso se toma como verdad**: los precios, las duraciones, los buffers y las
// ventanas ocupadas se recalculan acá contra la base. Lo único que se usa del
// pedido son los identificadores y los horarios elegidos.
//
// De lo contrario alcanzaría con editar la petición para reservarse un turno a
// precio cero, con un profesional que no presta ese servicio o fuera del
// horario del local.
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buscarReservaPorToken,
  cancelarReserva,
  cargarContextoDisponibilidad,
  calcularSenia,
  configuracionDelNegocio,
  completarReserva,
  crearSolicitudCambio,
  generarTokenGestion,
  HorarioNoDisponibleError,
  limiteCambioAutomatico,
  puedeGestionarSolo,
  reprogramarReserva,
  retenerHorario,
  tieneSolicitudPendiente,
  type BaseDatos,
  type BloqueARetener,
  type ReservaConDetalle,
} from '@manly/base-datos';
import type {
  BloqueElegido,
  PedidoConfirmacion,
  PedidoRetencion,
  ReservaPublica,
  ResultadoGestion,
  Retencion,
} from '@manly/contratos';

import { BASE_DATOS } from '../../comun/base-datos/base-datos.modulo';
import { NotificacionesServicio } from '../notificaciones/notificaciones.servicio';
import { calcularFranjasDeTrabajo } from '../disponibilidad/dominio/calendario';
import { algunoContiene } from '../disponibilidad/dominio/intervalos';

const MINUTO = 60_000;

@Injectable()
export class ReservasServicio {
  constructor(
    @Inject(BASE_DATOS) private readonly bd: BaseDatos,
    private readonly notificaciones: NotificacionesServicio,
  ) {}

  /** Retiene el horario elegido, antes de pedirle los datos al cliente. */
  async retener(pedido: PedidoRetencion): Promise<Retencion> {
    const { bloques, minutosRetencion } = await this.validarBloques(
      pedido.sucursalId,
      pedido.bloques,
    );

    const { token, hash } = generarTokenGestion();

    try {
      const retencion = await retenerHorario(this.bd, {
        sucursalId: pedido.sucursalId,
        bloques,
        hashTokenGestion: hash,
        minutosRetencion,
      });

      return {
        reservaId: retencion.reservaId,
        token,
        comienzaEn: retencion.comienzaEn.toISOString(),
        terminaEn: retencion.terminaEn.toISOString(),
        retencionExpiraEn: retencion.retencionExpiraEn.toISOString(),
        precioTotalCentavos: retencion.precioTotalCentavos,
        seniaTotalCentavos: retencion.seniaTotalCentavos,
      };
    } catch (error: unknown) {
      if (error instanceof HorarioNoDisponibleError) {
        throw new ConflictException(error.message);
      }

      throw error;
    }
  }

  /** Completa la reserva retenida con los datos del cliente. */
  async confirmar(pedido: PedidoConfirmacion): Promise<ReservaPublica> {
    const reserva = await buscarReservaPorToken(this.bd, pedido.token);

    if (!reserva) {
      throw new NotFoundException('No encontramos esa reserva.');
    }

    if (reserva.estado !== 'pendiente_pago') {
      throw new ConflictException('Esta reserva ya fue completada.');
    }

    if (reserva.retencionExpiraEn && reserva.retencionExpiraEn.getTime() <= Date.now()) {
      throw new ConflictException(
        'Se venció el tiempo para completar la reserva y el horario quedó libre.',
      );
    }

    // Sin seña no hay nada que esperar: la reserva queda confirmada. Con seña
    // sigue pendiente hasta que el webhook de pago la confirme (Fase 6).
    const completada = await completarReserva(this.bd, {
      reservaId: reserva.id,
      nombre: pedido.cliente.nombre,
      canalContacto: pedido.cliente.canalContacto,
      whatsapp: pedido.cliente.whatsapp ?? null,
      email: pedido.cliente.email ?? null,
      notas: pedido.cliente.notas ?? null,
      confirmar: reserva.seniaTotalCentavos === 0,
    });

    if (!completada) {
      throw new ConflictException('La reserva ya no se puede completar.');
    }

    // Los avisos se preparan siempre acá, que es el único momento en el que se
    // tiene el token en claro: en la base sólo queda su hash. Si falta pagar la
    // seña quedan retenidos y los libera el pago.
    const actualizada = await buscarReservaPorToken(this.bd, pedido.token);

    if (actualizada) {
      await this.avisarConfirmacion(actualizada, pedido.token, completada.estado !== 'confirmada');
    }

    return this.consultar(pedido.token);
  }

  /** Devuelve la reserva del enlace privado. */
  async consultar(token: string): Promise<ReservaPublica> {
    const reserva = await buscarReservaPorToken(this.bd, token);

    if (!reserva) {
      throw new NotFoundException('No encontramos esa reserva.');
    }

    return this.aContratoPublico(reserva);
  }

  /**
   * Cancela la reserva, o deja una solicitud si ya no hay anticipación.
   *
   * Dentro del plazo mínimo el horario **sigue ocupado** hasta que gerencia
   * resuelva: liberarlo de una y después no poder devolver la seña sería peor.
   */
  async cancelar(token: string, motivo: string | null): Promise<ResultadoGestion> {
    const reserva = await buscarReservaPorToken(this.bd, token);

    if (!reserva) {
      throw new NotFoundException('No encontramos esa reserva.');
    }

    if (reserva.estado === 'cancelada') {
      return { resultado: 'cancelada', mensaje: 'Esta reserva ya estaba cancelada.' };
    }

    if (reserva.estado !== 'pendiente_pago' && reserva.estado !== 'confirmada') {
      throw new ConflictException('Esta reserva ya no se puede cancelar.');
    }

    if (puedeGestionarSolo(reserva)) {
      await cancelarReserva(this.bd, reserva.id);
      await this.notificaciones.alCancelar(reserva, token);

      return {
        resultado: 'cancelada',
        mensaje: reserva.seniaTotalCentavos
          ? 'Cancelamos tu turno. Nos comunicamos por la seña.'
          : 'Cancelamos tu turno.',
      };
    }

    if (await tieneSolicitudPendiente(this.bd, reserva.id)) {
      throw new ConflictException('Ya hay un pedido en curso para esta reserva.');
    }

    await crearSolicitudCambio(this.bd, {
      reservaId: reserva.id,
      tipo: 'cancelacion',
      motivo,
    });

    return {
      resultado: 'solicitada',
      mensaje: `Falta menos de ${String(reserva.horasMinimasCancelacion)} horas para tu turno, así que lo revisa el local. Te avisamos apenas se resuelva.`,
    };
  }

  /** Mueve la reserva a otro horario, o deja una solicitud si ya no hay plazo. */
  async reprogramar(
    token: string,
    pedido: { sucursalId: string; bloques: BloqueElegido[]; motivo?: string },
  ): Promise<ResultadoGestion> {
    const reserva = await buscarReservaPorToken(this.bd, token);

    if (!reserva) {
      throw new NotFoundException('No encontramos esa reserva.');
    }

    if (reserva.estado !== 'confirmada' && reserva.estado !== 'pendiente_pago') {
      throw new ConflictException('Esta reserva ya no se puede reprogramar.');
    }

    if (pedido.sucursalId !== reserva.sucursal.id) {
      throw new BadRequestException('No se puede mover una reserva a otra sucursal.');
    }

    if (!puedeGestionarSolo(reserva)) {
      if (await tieneSolicitudPendiente(this.bd, reserva.id)) {
        throw new ConflictException('Ya hay un pedido en curso para esta reserva.');
      }

      await crearSolicitudCambio(this.bd, {
        reservaId: reserva.id,
        tipo: 'reprogramacion',
        motivo: pedido.motivo ?? null,
        propuesta: pedido.bloques,
      });

      return {
        resultado: 'solicitada',
        mensaje: `Falta menos de ${String(reserva.horasMinimasCancelacion)} horas para tu turno, así que el cambio lo revisa el local. Tu horario actual sigue reservado.`,
      };
    }

    const { bloques } = await this.validarBloques(pedido.sucursalId, pedido.bloques);

    try {
      // Atómico: si el horario nuevo choca, la transacción se deshace y el
      // turno original queda intacto.
      await reprogramarReserva(this.bd, { reservaId: reserva.id, bloques });
    } catch (error: unknown) {
      if (error instanceof HorarioNoDisponibleError) {
        throw new ConflictException(error.message);
      }

      throw error;
    }

    const actualizada = await buscarReservaPorToken(this.bd, token);

    if (actualizada) {
      await this.notificaciones.alReprogramar(actualizada, token, await this.horasDeRecordatorio());
    }

    return { resultado: 'reprogramada', mensaje: 'Listo, movimos tu turno.' };
  }

  /**
   * Reconstruye los bloques desde la base y verifica que la secuencia sea real.
   *
   * Comprueba, en este orden: que los servicios existan y se presten en la
   * sucursal, que el profesional pueda prestarlos, que los bloques sean
   * consecutivos y sin huecos, que la duración coincida con la del servicio, y
   * que la ventana ocupada entre en el horario de trabajo. La restricción de la
   * base es la última barrera, no la primera.
   */
  private async validarBloques(
    sucursalId: string,
    elegidos: BloqueElegido[],
  ): Promise<{ bloques: BloqueARetener[]; minutosRetencion: number }> {
    const ordenados = [...elegidos].sort((a, b) => a.orden - b.orden);
    const comienzos = ordenados.map((bloque) => new Date(bloque.comienzaEn).getTime());

    if (comienzos.some((valor) => !Number.isFinite(valor))) {
      throw new BadRequestException('Los horarios elegidos no son válidos.');
    }

    if (comienzos[0]! <= Date.now()) {
      throw new BadRequestException('No se puede reservar un horario que ya pasó.');
    }

    const rango = {
      desde: comienzos[0]! - 60 * MINUTO,
      hasta:
        Math.max(...ordenados.map((bloque) => new Date(bloque.terminaEn).getTime())) + 60 * MINUTO,
    };

    const contexto = await cargarContextoDisponibilidad(this.bd, {
      sucursalId,
      servicioIds: [...new Set(ordenados.map((bloque) => bloque.servicioId))],
      rango: { desde: new Date(rango.desde), hasta: new Date(rango.hasta) },
    });

    if (ordenados.length > contexto.configuracion.maximoServiciosPorReserva) {
      throw new BadRequestException(
        `Se pueden reservar hasta ${String(contexto.configuracion.maximoServiciosPorReserva)} servicios juntos.`,
      );
    }

    const porId = new Map(contexto.servicios.map((servicio) => [servicio.id, servicio]));

    const franjasPorProfesional = calcularFranjasDeTrabajo({
      zonaHoraria: contexto.configuracion.zonaHoraria,
      sucursalId,
      profesionalIds: [...contexto.nombresProfesionales.keys()],
      horarios: contexto.horarios,
      excepciones: contexto.excepciones,
      rango,
    });

    const bloques: BloqueARetener[] = [];
    let finAnterior: number | null = null;

    for (const [indice, elegido] of ordenados.entries()) {
      const servicio = porId.get(elegido.servicioId);

      if (!servicio) {
        throw new BadRequestException(
          'Alguno de los servicios elegidos no existe o no se presta en esa sucursal.',
        );
      }

      const compatibles = contexto.compatiblesPorServicio.get(servicio.id) ?? [];

      if (!compatibles.includes(elegido.profesionalId)) {
        throw new BadRequestException(
          `${contexto.nombresProfesionales.get(elegido.profesionalId) ?? 'Ese profesional'} no presta ${servicio.nombre} en esta sucursal.`,
        );
      }

      const comienzaEn = new Date(elegido.comienzaEn).getTime();
      const terminaEn = comienzaEn + servicio.duracionMinutos * MINUTO;

      // La duración manda la base, no el pedido.
      if (new Date(elegido.terminaEn).getTime() !== terminaEn) {
        throw new BadRequestException('La duración enviada no coincide con la del servicio.');
      }

      // Los bloques van pegados: sin huecos ni superposiciones.
      if (finAnterior !== null && comienzaEn !== finAnterior) {
        throw new BadRequestException('Los servicios tienen que ser uno detrás del otro.');
      }

      const ventanaOcupada = {
        desde: comienzaEn - servicio.minutosPreparacion * MINUTO,
        hasta: terminaEn + servicio.minutosLimpieza * MINUTO,
      };

      const franjas = franjasPorProfesional.get(elegido.profesionalId) ?? [];

      if (!algunoContiene(franjas, ventanaOcupada)) {
        throw new BadRequestException('Ese horario está fuera del horario de atención.');
      }

      bloques.push({
        servicioId: servicio.id,
        profesionalId: elegido.profesionalId,
        orden: indice,
        comienzaEn: new Date(comienzaEn),
        terminaEn: new Date(terminaEn),
        ocupaDesde: new Date(ventanaOcupada.desde),
        ocupaHasta: new Date(ventanaOcupada.hasta),
        servicioNombre: servicio.nombre,
        duracionMinutos: servicio.duracionMinutos,
        precioCentavos: servicio.precioCentavos,
        seniaCentavos: calcularSenia(servicio),
        minutosPreparacion: servicio.minutosPreparacion,
        minutosLimpieza: servicio.minutosLimpieza,
      });

      finAnterior = terminaEn;
    }

    return { bloques, minutosRetencion: contexto.configuracion.minutosRetencion };
  }

  /** Encola el aviso de confirmación con los recordatorios configurados. */
  private async avisarConfirmacion(
    reserva: ReservaConDetalle,
    token: string,
    retenidas: boolean,
  ): Promise<void> {
    await this.notificaciones.alConfirmar(
      reserva,
      token,
      await this.horasDeRecordatorio(),
      retenidas,
    );
  }

  /**
   * Horas de anticipación de los recordatorios.
   *
   * Salen de la configuración del negocio para que gerencia pueda cambiarlas
   * sin tocar código. El segundo puede estar apagado.
   */
  private async horasDeRecordatorio(): Promise<{ primero: number; segundo: number | null }> {
    const configuracion = await configuracionDelNegocio(this.bd);

    return {
      primero: configuracion.horasRecordatorioPrimero,
      segundo: configuracion.horasRecordatorioSegundo,
    };
  }

  private aContratoPublico(reserva: ReservaConDetalle): ReservaPublica {
    const gestionable = puedeGestionarSolo(reserva);

    return {
      id: reserva.id,
      estado: reserva.estado,
      sucursal: {
        nombre: reserva.sucursal.nombre,
        barrio: reserva.sucursal.barrio,
        direccion: reserva.sucursal.direccion,
      },
      clienteNombre: reserva.clienteNombre,
      comienzaEn: reserva.comienzaEn.toISOString(),
      terminaEn: reserva.terminaEn.toISOString(),
      precioTotalCentavos: reserva.precioTotalCentavos,
      seniaTotalCentavos: reserva.seniaTotalCentavos,
      puedeGestionarse: gestionable,
      horasMinimasCancelacion: reserva.horasMinimasCancelacion,
      limiteCambioAutomatico: limiteCambioAutomatico(reserva).toISOString(),
      bloques: reserva.bloques.map((bloque) => ({
        orden: bloque.orden,
        servicioNombre: bloque.servicioNombre,
        profesionalNombre: bloque.profesionalNombre,
        comienzaEn: bloque.comienzaEn.toISOString(),
        terminaEn: bloque.terminaEn.toISOString(),
        duracionMinutos: bloque.duracionMinutos,
        precioCentavos: bloque.precioCentavos,
      })),
    };
  }
}
