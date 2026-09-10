// Cobro de la seña y procesamiento de las notificaciones de pago.
//
// Dos reglas gobiernan todo este módulo:
//
//   1. **El webhook no se cree, se verifica.** La notificación sólo avisa que
//      hay algo nuevo; el estado real se consulta contra la pasarela. Confiar
//      en el cuerpo permitiría confirmar turnos sin pagar.
//   2. **Procesar dos veces no debe cobrar ni confirmar dos veces.** Las
//      notificaciones llegan repetidas de forma habitual.
import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  buscarReservaPorToken,
  confirmarPorPago,
  extenderRetencion,
  pagoDeSeniaAprobado,
  pagosDeReserva,
  registrarPagoDePasarela,
  registrarPagoPresencial,
  registrarReintegro,
  totalCobrado,
  type BaseDatos,
} from '@manly/base-datos';
import type { EstadoDelPago, PagoPresencial, PreferenciaCreada, Reintegro } from '@manly/contratos';

import { BASE_DATOS } from '../../comun/base-datos/base-datos.modulo';
import type { Entorno } from '../../configuracion/entorno';
import { NotificacionesServicio } from '../notificaciones/notificaciones.servicio';
import { verificarFirmaWebhook } from './dominio/firma-webhook';
import { PASARELA, type Pasarela } from './pasarela/pasarela';

/**
 * Minutos que se sostiene el horario mientras la persona paga.
 *
 * Es más que la retención inicial de diez minutos a propósito: completar un
 * checkout con tarjeta lleva su tiempo, y perder el turno mientras se está
 * pagando sería la peor forma de perderlo.
 */
const MINUTOS_RETENCION_PAGO = 20;

@Injectable()
export class PagosServicio {
  private readonly registro = new Logger(PagosServicio.name);

  constructor(
    @Inject(BASE_DATOS) private readonly bd: BaseDatos,
    @Inject(PASARELA) private readonly pasarela: Pasarela,
    private readonly configuracion: ConfigService<Entorno, true>,
    private readonly notificaciones: NotificacionesServicio,
  ) {}

  /** Crea el cobro de la seña y devuelve el enlace de pago. */
  async crearPreferencia(token: string): Promise<PreferenciaCreada> {
    const reserva = await buscarReservaPorToken(this.bd, token);

    if (!reserva) {
      throw new NotFoundException('No encontramos esa reserva.');
    }

    if (reserva.estado === 'confirmada') {
      throw new ConflictException('Esta reserva ya está confirmada.');
    }

    if (reserva.estado !== 'pendiente_pago') {
      throw new ConflictException('Esta reserva ya no admite pagos.');
    }

    if (reserva.seniaTotalCentavos <= 0) {
      throw new ConflictException('Esta reserva no lleva seña.');
    }

    // Si ya se pagó, no se vuelve a cobrar aunque se pida la preferencia otra vez.
    if (await pagoDeSeniaAprobado(this.bd, reserva.id)) {
      throw new ConflictException('La seña de esta reserva ya fue pagada.');
    }

    const urlPublica = this.configuracion.get('NEXT_PUBLIC_URL_PUBLICA', { infer: true });
    const urlApi = this.configuracion.get('URL_PUBLICA_API', { infer: true });

    const preferencia = await this.pasarela.crearPreferencia({
      reservaId: reserva.id,
      descripcion: `Seña de tu turno en ${reserva.sucursal.nombre}`,
      montoCentavos: reserva.seniaTotalCentavos,
      urlRetorno: `${urlPublica}/mi-reserva/${token}`,
      urlNotificacion: `${urlApi}/webhooks/mercado-pago`,
      emailCliente: null,
    });

    // Se estira la retención: el horario tiene que seguir siendo suyo mientras
    // completa el pago.
    await extenderRetencion(this.bd, reserva.id, MINUTOS_RETENCION_PAGO);

    return {
      preferenciaId: preferencia.preferenciaId,
      urlPago: preferencia.urlPago,
      montoCentavos: reserva.seniaTotalCentavos,
      retencionExpiraEn: new Date(Date.now() + MINUTOS_RETENCION_PAGO * 60_000).toISOString(),
    };
  }

  /**
   * Procesa una notificación de la pasarela.
   *
   * Devuelve siempre sin lanzar: a un webhook se le responde 200 aunque no haya
   * nada que hacer, porque un error hace que la pasarela reintente en bucle. Lo
   * que sí corta el paso es la firma, que se verifica antes de llegar acá.
   */
  async procesarNotificacion(idPagoExterno: string): Promise<{ procesado: boolean }> {
    const pago = await this.pasarela.consultarPago(idPagoExterno);

    if (!pago) {
      this.registro.warn(`Notificación de un pago inexistente: ${idPagoExterno}`);
      return { procesado: false };
    }

    if (!pago.reservaId) {
      this.registro.warn(`El pago ${idPagoExterno} no trae reserva asociada.`);
      return { procesado: false };
    }

    const { seAprobóAhora } = await registrarPagoDePasarela(this.bd, {
      reservaId: pago.reservaId,
      idPagoExterno: pago.id,
      estado: pago.estado === 'reintegrado' ? 'reintegrado' : pago.estado,
      montoCentavos: pago.montoCentavos,
      referenciaExterna: pago.reservaId,
      datosCrudos: pago.crudo,
    });

    if (seAprobóAhora) {
      const confirmada = await confirmarPorPago(this.bd, pago.reservaId);

      this.registro.warn(
        confirmada
          ? `Reserva ${pago.reservaId} confirmada por pago acreditado.`
          : `Pago acreditado para ${pago.reservaId}, pero la reserva no estaba lista para confirmar.`,
      );

      // Los avisos ya estaban preparados y retenidos desde que el cliente
      // completó sus datos: acá sólo se liberan. Reconstruirlos no sería
      // posible, porque el enlace de gestión lleva un token que en la base sólo
      // existe hasheado.
      if (confirmada) {
        const liberadas = await this.notificaciones.alAcreditarsePago(pago.reservaId);

        this.registro.warn(`Avisos liberados para ${pago.reservaId}: ${String(liberadas)}.`);
      }
    }

    return { procesado: true };
  }

  /** Verifica que la notificación venga realmente de la pasarela. */
  verificarFirma(datos: {
    cabeceraFirma: string | undefined;
    idPeticion: string | undefined;
    idRecurso: string | undefined;
  }): boolean {
    const secreto = this.configuracion.get('MP_SECRETO_WEBHOOK', { infer: true }) ?? '';

    const resultado = verificarFirmaWebhook({ ...datos, secreto });

    if (!resultado.valida) {
      // El motivo se registra pero nunca se responde: decirle a un atacante
      // qué falló le ahorra trabajo.
      this.registro.warn(`Webhook rechazado: ${resultado.motivo}`);
    }

    return resultado.valida;
  }

  /** Estado del pago para la pantalla a la que vuelve la persona. */
  async estadoDelPago(token: string): Promise<EstadoDelPago> {
    const reserva = await buscarReservaPorToken(this.bd, token);

    if (!reserva) {
      throw new NotFoundException('No encontramos esa reserva.');
    }

    const movimientos = await pagosDeReserva(this.bd, reserva.id);
    const senia = movimientos.find((movimiento) => movimiento.tipo === 'senia');

    if (reserva.estado === 'confirmada') {
      return {
        reservaId: reserva.id,
        reservaConfirmada: true,
        estadoPago: 'aprobado',
        esperandoConfirmacion: false,
        mensaje: 'Listo, tu turno está confirmado.',
      };
    }

    if (senia?.estado === 'rechazado' || senia?.estado === 'cancelado') {
      return {
        reservaId: reserva.id,
        reservaConfirmada: false,
        estadoPago: senia.estado,
        esperandoConfirmacion: false,
        mensaje: 'El pago no se pudo procesar. Podés intentar de nuevo.',
      };
    }

    // Todavía sin resolver. La notificación puede demorar, así que se le pide a
    // la web que siga consultando en vez de dar el pago por perdido.
    return {
      reservaId: reserva.id,
      reservaConfirmada: false,
      estadoPago: senia?.estado === 'pendiente' ? 'pendiente' : null,
      esperandoConfirmacion: reserva.estado === 'pendiente_pago',
      mensaje: 'Estamos esperando la confirmación del pago.',
    };
  }

  // ── Panel ──────────────────────────────────────────────────────────────────

  /** Registra un cobro hecho en el local. */
  async registrarPresencial(datos: PagoPresencial, usuarioId: string): Promise<{ id: string }> {
    const id = await registrarPagoPresencial(this.bd, {
      reservaId: datos.reservaId,
      tipo: datos.tipo,
      medio: datos.medio,
      montoCentavos: datos.montoCentavos,
      usuarioId,
    });

    return { id };
  }

  /**
   * Ejecuta un reintegro.
   *
   * Nunca es automático: lo dispara gerencia y el contrato exige una
   * confirmación explícita. Si el pago original fue por la pasarela se intenta
   * devolver por ahí; si falla, igual queda registrado para que alguien lo
   * resuelva a mano y no se pierda el rastro.
   */
  async reintegrar(datos: Reintegro, usuarioId: string): Promise<{ id: string; ok: boolean }> {
    const cobrado = await totalCobrado(this.bd, datos.reservaId);

    if (datos.montoCentavos > cobrado) {
      throw new ConflictException(
        'No se puede reintegrar más de lo que se cobró por esta reserva.',
      );
    }

    const senia = await pagoDeSeniaAprobado(this.bd, datos.reservaId);
    let ok = true;
    let crudo: unknown = { motivo: 'Reintegro registrado sin movimiento en la pasarela.' };

    if (senia?.idPagoExterno) {
      const resultado = await this.pasarela.reintegrar(senia.idPagoExterno, datos.montoCentavos);
      ok = resultado.ok;
      crudo = resultado.crudo;
    }

    const id = await registrarReintegro(this.bd, {
      reservaId: datos.reservaId,
      montoCentavos: datos.montoCentavos,
      medio: senia?.idPagoExterno ? 'mercado_pago' : 'efectivo',
      usuarioId,
      idPagoExterno: null,
      datosCrudos: { ...(crudo as object), motivo: datos.motivo ?? null, ok },
    });

    return { id, ok };
  }
}
