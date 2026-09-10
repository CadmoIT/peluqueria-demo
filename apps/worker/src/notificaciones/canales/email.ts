// Canal de email mediante Resend.
//
// A diferencia de WhatsApp, acá no hay plantillas que aprobar: el cuerpo se
// manda armado. Se envía en texto plano y en HTML mínimo, porque un correo
// transaccional tiene que leerse igual en cualquier cliente.
import type { MensajeArmado } from '../plantillas';
import type { Canal, ResultadoEnvio } from './canal';

const BASE_API = 'https://api.resend.com';
const TIEMPO_LIMITE_MS = 15_000;

interface RespuestaEnvio {
  id?: string;
  message?: string;
  name?: string;
}

/** Escapa el texto que se interpola en el HTML del correo. */
function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Convierte el texto plano en un HTML sobrio, con los enlaces navegables. */
function aHtml(texto: string): string {
  const parrafos = texto
    .split('\n\n')
    .map((parrafo) => {
      const conEnlaces = escapar(parrafo).replace(
        /(https?:\/\/[^\s]+)/g,
        '<a href="$1" style="color:#111">$1</a>',
      );

      return `<p style="margin:0 0 1em">${conEnlaces.replace(/\n/g, '<br>')}</p>`;
    })
    .join('');

  return (
    `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#111;` +
    `max-width:38em;margin:0 auto;padding:2em 1.5em">${parrafos}` +
    `<p style="margin-top:2em;font-size:12px;color:#666">Manly Barber Studio</p></div>`
  );
}

export class CanalEmail implements Canal {
  readonly nombre = 'email';

  constructor(
    private readonly apiKey: string,
    private readonly remitente: string,
  ) {}

  async enviar(destino: string, mensaje: MensajeArmado): Promise<ResultadoEnvio> {
    let respuesta: Response;

    try {
      respuesta = await fetch(`${BASE_API}/emails`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.remitente,
          to: [destino],
          subject: mensaje.asunto,
          text: mensaje.texto,
          html: aHtml(mensaje.texto),
        }),
        signal: AbortSignal.timeout(TIEMPO_LIMITE_MS),
      });
    } catch (error: unknown) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Fallo de red.',
        reintentable: true,
      };
    }

    const datos = (await respuesta.json().catch(() => null)) as RespuestaEnvio | null;

    if (respuesta.ok && datos?.id) {
      return { ok: true, idExterno: datos.id };
    }

    const detalle = datos?.message ?? `HTTP ${String(respuesta.status)}`;

    return {
      ok: false,
      error: `Resend: ${detalle}`,
      // Una dirección inválida no mejora con el tiempo; una caída del
      // proveedor o un límite de tasa, sí.
      reintentable: respuesta.status >= 500 || respuesta.status === 429,
    };
  }
}
