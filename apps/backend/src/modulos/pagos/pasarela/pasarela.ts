// Contrato con la pasarela de pagos.
//
// El resto del módulo habla con esta interfaz y no con Mercado Pago
// directamente. Eso permite dos cosas: correr el flujo completo sin
// credenciales reales, y que el día que haya que sumar o cambiar de proveedor
// no se toque la lógica de reservas.
//
// Hay dos implementaciones: la real contra Mercado Pago y una simulada para
// desarrollo y pruebas.

/** Lo necesario para armar el cobro de una seña. */
export interface DatosPreferencia {
  /** Identificador de la reserva. Viaja como `external_reference`. */
  reservaId: string;
  descripcion: string;
  montoCentavos: number;
  /** Adónde vuelve la persona después de pagar. */
  urlRetorno: string;
  /** Adónde manda la pasarela sus notificaciones. */
  urlNotificacion: string;
  /** Email del cliente, si lo dio. Precarga el formulario del checkout. */
  emailCliente?: string | null;
}

export interface PreferenciaPasarela {
  preferenciaId: string;
  urlPago: string;
}

/** Estado de un pago tal como lo informa la pasarela. */
export type EstadoPasarela = 'pendiente' | 'aprobado' | 'rechazado' | 'cancelado' | 'reintegrado';

export interface PagoPasarela {
  /** Identificador del pago en la pasarela. */
  id: string;
  estado: EstadoPasarela;
  montoCentavos: number;
  /** El `external_reference` con el que se creó la preferencia. */
  reservaId: string | null;
  /** Respuesta cruda, para poder auditar y reconciliar después. */
  crudo: unknown;
}

export interface Pasarela {
  /** Crea el cobro y devuelve el enlace al que se redirige a la persona. */
  crearPreferencia(datos: DatosPreferencia): Promise<PreferenciaPasarela>;

  /**
   * Consulta el pago en la pasarela.
   *
   * Se llama siempre después de recibir una notificación: **el cuerpo del
   * webhook no se toma como verdad**, sólo como aviso de que hay algo nuevo que
   * mirar. Devuelve null si el pago no existe.
   */
  consultarPago(idPago: string): Promise<PagoPasarela | null>;

  /** Devuelve el dinero de un pago aprobado. */
  reintegrar(idPago: string, montoCentavos: number): Promise<{ ok: boolean; crudo: unknown }>;
}

/** Token de inyección de la pasarela. */
export const PASARELA = Symbol('PASARELA_PAGO');
