// Encolado de notificaciones.
//
// La API no manda nada: sólo escribe en la bandeja de salida. El envío lo hace
// el worker. Así una caída de WhatsApp o de Resend nunca hace fallar una
// reserva, y queda registro de qué se intentó mandar.
//
// Los datos del mensaje se copian acá. Si mañana cambia un precio o el nombre
// de un profesional, el recordatorio sigue diciendo lo que se le prometió.
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  descartarPendientesDeReserva,
  encolarNotificacion,
  liberarRetenidasDeReserva,
  type BaseDatos,
  type CanalNotificacion,
  type ReservaConDetalle,
  type TipoNotificacion,
} from '@manly/base-datos';

import { BASE_DATOS } from '../../comun/base-datos/base-datos.modulo';
import type { Entorno } from '../../configuracion/entorno';

/** Recordatorios que quedan sin sentido si el turno se cancela o se mueve. */
const RECORDATORIOS: TipoNotificacion[] = ['recordatorio_primero', 'recordatorio_segundo'];

@Injectable()
export class NotificacionesServicio {
  private readonly registro = new Logger(NotificacionesServicio.name);

  constructor(
    @Inject(BASE_DATOS) private readonly bd: BaseDatos,
    private readonly configuracion: ConfigService<Entorno, true>,
  ) {}

  /**
   * Avisa que el turno quedó confirmado y programa los recordatorios.
   *
   * Los recordatorios se encolan con fecha futura: la bandeja los ignora hasta
   * que llegue su momento. Los que caerían en el pasado —una reserva para
   * dentro de una hora— no se encolan.
   */
  async alConfirmar(
    reserva: ReservaConDetalle,
    token: string,
    horasRecordatorios: { primero: number; segundo: number | null },
    /**
     * Deja los avisos preparados pero sin salir. Se usa cuando falta pagar la
     * seña: el enlace de gestión sólo se puede armar acá, porque en la base el
     * token está hasheado, pero el aviso no debe salir hasta que el pago entre.
     */
    retenidas = false,
  ): Promise<void> {
    const destino = this.destinoDe(reserva);

    if (!destino) {
      this.registro.warn(`La reserva ${reserva.id} no tiene por dónde ser avisada.`);
      return;
    }

    const datos = this.datosDelMensaje(reserva, token);

    await this.encolar(reserva, 'confirmacion', destino, datos, new Date(), retenidas);

    const comienzo = reserva.comienzaEn.getTime();
    const ahora = Date.now();

    const recordatorios: [TipoNotificacion, number | null][] = [
      ['recordatorio_primero', horasRecordatorios.primero],
      ['recordatorio_segundo', horasRecordatorios.segundo],
    ];

    for (const [tipo, horas] of recordatorios) {
      if (horas === null) continue;

      const cuando = comienzo - horas * 3_600_000;

      // Un recordatorio cuyo momento ya pasó no se manda: sería un aviso
      // "para mañana" llegando después del turno.
      if (cuando <= ahora) continue;

      await this.encolar(reserva, tipo, destino, datos, new Date(cuando), retenidas);
    }
  }

  /** Avisa que se canceló y descarta los recordatorios que ya no aplican. */
  async alCancelar(reserva: ReservaConDetalle, token: string): Promise<void> {
    await descartarPendientesDeReserva(this.bd, reserva.id, RECORDATORIOS);

    const destino = this.destinoDe(reserva);

    if (!destino) return;

    await this.encolar(
      reserva,
      'cancelacion',
      destino,
      this.datosDelMensaje(reserva, token),
      new Date(),
    );
  }

  /**
   * Avisa que se movió el turno y reprograma los recordatorios.
   *
   * Los viejos se descartan primero: mandar el recordatorio del horario
   * anterior haría que la persona se presente cuando ya no la esperan.
   */
  async alReprogramar(
    reserva: ReservaConDetalle,
    token: string,
    horasRecordatorios: { primero: number; segundo: number | null },
  ): Promise<void> {
    await descartarPendientesDeReserva(this.bd, reserva.id, RECORDATORIOS);

    const destino = this.destinoDe(reserva);

    if (!destino) return;

    const datos = this.datosDelMensaje(reserva, token);

    await this.encolar(reserva, 'reprogramacion', destino, datos, new Date());

    const comienzo = reserva.comienzaEn.getTime();

    for (const [tipo, horas] of [
      ['recordatorio_primero', horasRecordatorios.primero],
      ['recordatorio_segundo', horasRecordatorios.segundo],
    ] as [TipoNotificacion, number | null][]) {
      if (horas === null) continue;

      const cuando = comienzo - horas * 3_600_000;

      if (cuando <= Date.now()) continue;

      await this.encolar(reserva, tipo, destino, datos, new Date(cuando));
    }
  }

  /** Libera los avisos que estaban esperando que se acreditara el pago. */
  async alAcreditarsePago(reservaId: string): Promise<number> {
    return liberarRetenidasDeReserva(this.bd, reservaId);
  }

  /** Avisa la resolución de una solicitud que atendió gerencia. */
  async alResolverSolicitud(
    reserva: ReservaConDetalle,
    token: string,
    aprobada: boolean,
  ): Promise<void> {
    const destino = this.destinoDe(reserva);

    if (!destino) return;

    await this.encolar(
      reserva,
      aprobada ? 'solicitud_aprobada' : 'solicitud_rechazada',
      destino,
      this.datosDelMensaje(reserva, token),
      new Date(),
    );
  }

  // ── Interno ────────────────────────────────────────────────────────────────

  private async encolar(
    reserva: ReservaConDetalle,
    tipo: TipoNotificacion,
    destino: { canal: CanalNotificacion; valor: string },
    datos: unknown,
    programadaPara: Date,
    retenida = false,
  ): Promise<void> {
    await encolarNotificacion(this.bd, {
      reservaId: reserva.id,
      tipo,
      canal: destino.canal,
      destino: destino.valor,
      // El nombre real de la plantilla lo resuelve el worker al armar el
      // mensaje; acá se guarda el tipo para poder auditar.
      plantilla: tipo,
      datos,
      programadaPara,
      retenida,
    });
  }

  /** Por dónde avisarle, según el canal que la persona eligió. */
  private destinoDe(
    reserva: ReservaConDetalle,
  ): { canal: CanalNotificacion; valor: string } | null {
    const contactos = reserva;

    if (contactos.canalContacto === 'whatsapp' && contactos.contactoWhatsapp) {
      return { canal: 'whatsapp', valor: contactos.contactoWhatsapp };
    }

    if (contactos.canalContacto === 'email' && contactos.contactoEmail) {
      return { canal: 'email', valor: contactos.contactoEmail };
    }

    // Sin canal declarado, se usa el dato que haya.
    if (contactos.contactoWhatsapp) {
      return { canal: 'whatsapp', valor: contactos.contactoWhatsapp };
    }

    if (contactos.contactoEmail) {
      return { canal: 'email', valor: contactos.contactoEmail };
    }

    return null;
  }

  private datosDelMensaje(reserva: ReservaConDetalle, token: string): unknown {
    const urlPublica = this.configuracion.get('NEXT_PUBLIC_URL_PUBLICA', { infer: true });

    return {
      clienteNombre: reserva.clienteNombre ?? 'Hola',
      sucursalNombre: reserva.sucursal.nombre,
      sucursalDireccion: reserva.sucursal.direccion,
      comienzaEn: reserva.comienzaEn.toISOString(),
      servicios: reserva.bloques.map((bloque) => bloque.servicioNombre),
      urlGestion: `${urlPublica}/mi-reserva/${token}`,
      horasMinimasCancelacion: reserva.horasMinimasCancelacion,
    };
  }
}
