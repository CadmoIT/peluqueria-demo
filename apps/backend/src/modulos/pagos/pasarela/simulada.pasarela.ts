// Pasarela simulada.
//
// Reemplaza a Mercado Pago cuando no hay credenciales: guarda los pagos en
// memoria y expone una pantalla de checkout falsa donde se elige el resultado.
// Permite recorrer el flujo entero —incluida la notificación firmada— sin
// tocar dinero real.
//
// Se activa cuando falta `MP_ACCESS_TOKEN`. En producción esa variable existe y
// nunca se usa esta implementación; el arranque avisa cuál está activa.
import { Logger } from '@nestjs/common';

import type {
  DatosPreferencia,
  EstadoPasarela,
  PagoPasarela,
  Pasarela,
  PreferenciaPasarela,
} from './pasarela';

interface PagoSimulado {
  id: string;
  estado: EstadoPasarela;
  montoCentavos: number;
  reservaId: string;
  creadoEn: number;
}

export class SimuladaPasarela implements Pasarela {
  private readonly registro = new Logger(SimuladaPasarela.name);

  /** Pagos y preferencias en memoria. Se pierden al reiniciar el proceso. */
  private readonly pagos = new Map<string, PagoSimulado>();
  private readonly preferencias = new Map<string, DatosPreferencia>();

  private contador = 0;

  constructor(private readonly urlBaseApi: string) {}

  crearPreferencia(datos: DatosPreferencia): Promise<PreferenciaPasarela> {
    this.contador += 1;
    const preferenciaId = `pref-simulada-${String(this.contador)}`;

    this.preferencias.set(preferenciaId, datos);

    this.registro.warn(
      `Pasarela simulada: preferencia ${preferenciaId} por ${String(datos.montoCentavos)} centavos.`,
    );

    return Promise.resolve({
      preferenciaId,
      // Lleva a la pantalla de checkout falsa que sirve la propia API.
      urlPago: `${this.urlBaseApi}/pagos/simulado/${preferenciaId}`,
    });
  }

  consultarPago(idPago: string): Promise<PagoPasarela | null> {
    const pago = this.pagos.get(idPago);

    if (!pago) return Promise.resolve(null);

    return Promise.resolve({
      id: pago.id,
      estado: pago.estado,
      montoCentavos: pago.montoCentavos,
      reservaId: pago.reservaId,
      crudo: { ...pago, simulado: true },
    });
  }

  reintegrar(idPago: string, montoCentavos: number): Promise<{ ok: boolean; crudo: unknown }> {
    const pago = this.pagos.get(idPago);

    if (!pago || pago.estado !== 'aprobado') {
      return Promise.resolve({ ok: false, crudo: { motivo: 'El pago no está aprobado.' } });
    }

    pago.estado = 'reintegrado';

    return Promise.resolve({ ok: true, crudo: { idPago, montoCentavos, simulado: true } });
  }

  // ── Sólo para la simulación ────────────────────────────────────────────────

  datosDePreferencia(preferenciaId: string): DatosPreferencia | null {
    return this.preferencias.get(preferenciaId) ?? null;
  }

  /**
   * Cambia el estado de un pago ya creado.
   *
   * Reproduce lo que hace Mercado Pago cuando un pago pendiente se acredita
   * después: el identificador es el mismo y llega una segunda notificación.
   */
  cambiarEstado(idPago: string, estado: EstadoPasarela): boolean {
    const pago = this.pagos.get(idPago);

    if (!pago) return false;

    pago.estado = estado;

    return true;
  }

  /**
   * Registra el resultado que eligió la persona en la pantalla falsa.
   * Devuelve el pago creado para poder notificarlo.
   */
  resolverPago(preferenciaId: string, estado: EstadoPasarela): PagoSimulado | null {
    const datos = this.preferencias.get(preferenciaId);

    if (!datos) return null;

    this.contador += 1;
    const pago: PagoSimulado = {
      id: `pago-simulado-${String(this.contador)}`,
      estado,
      montoCentavos: datos.montoCentavos,
      reservaId: datos.reservaId,
      creadoEn: Date.now(),
    };

    this.pagos.set(pago.id, pago);

    return pago;
  }
}
