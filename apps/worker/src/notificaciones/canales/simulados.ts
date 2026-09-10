// Canales simulados.
//
// Reemplazan a WhatsApp y a Resend cuando no hay credenciales: registran el
// mensaje y lo dan por entregado. Permiten recorrer el flujo completo —cola,
// reintentos, respaldo entre canales— sin mandar nada a nadie.
//
// Se activan cuando faltan las credenciales del canal correspondiente. El
// arranque avisa cuáles quedaron simulados.
import type { MensajeArmado } from '../plantillas';
import type { Canal, ResultadoEnvio } from './canal';

/** Un mensaje que "se envió", guardado para poder inspeccionarlo. */
export interface MensajeSimulado {
  canal: string;
  destino: string;
  plantilla: string;
  texto: string;
  enviadoEn: number;
}

export class CanalSimulado implements Canal {
  private readonly enviados: MensajeSimulado[] = [];

  /**
   * Destinos que deben fallar, para poder ejercitar reintentos y respaldo.
   * En desarrollo se deja vacío; las pruebas lo usan para forzar escenarios.
   */
  private readonly fallan = new Map<string, { error: string; reintentable: boolean }>();

  constructor(readonly nombre: string) {}

  enviar(destino: string, mensaje: MensajeArmado): Promise<ResultadoEnvio> {
    const fallo = this.fallan.get(destino);

    if (fallo) {
      return Promise.resolve({ ok: false, error: fallo.error, reintentable: fallo.reintentable });
    }

    this.enviados.push({
      canal: this.nombre,
      destino,
      plantilla: mensaje.plantilla,
      texto: mensaje.texto,
      enviadoEn: Date.now(),
    });

    console.warn(`[${this.nombre} simulado] a ${destino}: ${mensaje.asunto}`);

    return Promise.resolve({ ok: true, idExterno: `sim-${String(this.enviados.length)}` });
  }

  // ── Sólo para desarrollo y pruebas ─────────────────────────────────────────

  /** Hace fallar los envíos a un destino. */
  hacerFallar(destino: string, error: string, reintentable: boolean): void {
    this.fallan.set(destino, { error, reintentable });
  }

  /** Vuelve a aceptar envíos a un destino. */
  dejarDeFallar(destino: string): void {
    this.fallan.delete(destino);
  }

  mensajesEnviados(): MensajeSimulado[] {
    return [...this.enviados];
  }

  limpiar(): void {
    this.enviados.length = 0;
    this.fallan.clear();
  }
}
