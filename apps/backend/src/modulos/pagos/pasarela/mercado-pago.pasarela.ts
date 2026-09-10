// Pasarela real contra Mercado Pago (Checkout Pro).
//
// Manly no recibe ni guarda datos de tarjeta: la persona los ingresa dentro del
// checkout de Mercado Pago. De acá sale la preferencia y vuelve el resultado.
//
// Los nombres de los campos que se mandan y se leen (`external_reference`,
// `init_point`, `transaction_amount`) los impone el proveedor y por eso quedan
// en inglés.
import { Logger } from '@nestjs/common';

import type {
  DatosPreferencia,
  EstadoPasarela,
  PagoPasarela,
  Pasarela,
  PreferenciaPasarela,
} from './pasarela';

const BASE_API = 'https://api.mercadopago.com';

/** Corte de espera: una pasarela lenta no debe colgar la petición del cliente. */
const TIEMPO_LIMITE_MS = 10_000;

/** Traduce los estados de Mercado Pago a los del dominio. */
function traducirEstado(estado: string): EstadoPasarela {
  switch (estado) {
    case 'approved':
      return 'aprobado';
    case 'rejected':
      return 'rechazado';
    case 'cancelled':
      return 'cancelado';
    case 'refunded':
    case 'charged_back':
      return 'reintegrado';
    default:
      // `pending`, `in_process`, `authorized` y cualquier estado nuevo que
      // aparezca: se tratan como "todavía no resuelto", que es lo seguro.
      return 'pendiente';
  }
}

interface RespuestaPreferencia {
  id?: string;
  init_point?: string;
  sandbox_init_point?: string;
}

interface RespuestaPago {
  id?: number | string;
  status?: string;
  transaction_amount?: number;
  external_reference?: string | null;
}

export class MercadoPagoPasarela implements Pasarela {
  private readonly registro = new Logger(MercadoPagoPasarela.name);

  constructor(
    private readonly accessToken: string,
    /** En sandbox se usa el enlace de prueba en vez del productivo. */
    private readonly esSandbox: boolean,
  ) {}

  async crearPreferencia(datos: DatosPreferencia): Promise<PreferenciaPasarela> {
    const cuerpo = {
      items: [
        {
          title: datos.descripcion,
          quantity: 1,
          currency_id: 'ARS',
          // Mercado Pago trabaja en unidades, no en centavos.
          unit_price: datos.montoCentavos / 100,
        },
      ],
      // Es lo que ata la notificación a la reserva.
      external_reference: datos.reservaId,
      notification_url: datos.urlNotificacion,
      back_urls: {
        success: datos.urlRetorno,
        pending: datos.urlRetorno,
        failure: datos.urlRetorno,
      },
      auto_return: 'approved',
      ...(datos.emailCliente ? { payer: { email: datos.emailCliente } } : {}),
    };

    const respuesta = await this.pedir<RespuestaPreferencia>('/checkout/preferences', {
      method: 'POST',
      body: JSON.stringify(cuerpo),
    });

    const url = this.esSandbox
      ? (respuesta.sandbox_init_point ?? respuesta.init_point)
      : respuesta.init_point;

    if (!respuesta.id || !url) {
      throw new Error('Mercado Pago no devolvió una preferencia utilizable.');
    }

    return { preferenciaId: respuesta.id, urlPago: url };
  }

  async consultarPago(idPago: string): Promise<PagoPasarela | null> {
    let respuesta: RespuestaPago;

    try {
      respuesta = await this.pedir<RespuestaPago>(`/v1/payments/${idPago}`);
    } catch (error: unknown) {
      // Un pago inexistente no es un fallo del sistema: puede ser una
      // notificación de prueba o un identificador viejo.
      if (error instanceof ErrorPasarela && error.estado === 404) {
        return null;
      }

      throw error;
    }

    if (respuesta.id === undefined || !respuesta.status) {
      return null;
    }

    return {
      id: String(respuesta.id),
      estado: traducirEstado(respuesta.status),
      montoCentavos: Math.round((respuesta.transaction_amount ?? 0) * 100),
      reservaId: respuesta.external_reference ?? null,
      crudo: respuesta,
    };
  }

  async reintegrar(
    idPago: string,
    montoCentavos: number,
  ): Promise<{ ok: boolean; crudo: unknown }> {
    try {
      const respuesta = await this.pedir<unknown>(`/v1/payments/${idPago}/refunds`, {
        method: 'POST',
        body: JSON.stringify({ amount: montoCentavos / 100 }),
      });

      return { ok: true, crudo: respuesta };
    } catch (error: unknown) {
      this.registro.error(`Fallo el reintegro del pago ${idPago}`, error);

      return { ok: false, crudo: error instanceof Error ? error.message : String(error) };
    }
  }

  private async pedir<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
    const respuesta = await fetch(`${BASE_API}${ruta}`, {
      ...opciones,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...opciones.headers,
      },
      signal: AbortSignal.timeout(TIEMPO_LIMITE_MS),
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');

      throw new ErrorPasarela(
        respuesta.status,
        `Mercado Pago respondió ${String(respuesta.status)}: ${detalle.slice(0, 300)}`,
      );
    }

    return (await respuesta.json()) as T;
  }
}

export class ErrorPasarela extends Error {
  constructor(
    readonly estado: number,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorPasarela';
  }
}
