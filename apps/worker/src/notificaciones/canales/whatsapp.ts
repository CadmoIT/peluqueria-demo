// Canal de WhatsApp mediante la Cloud API oficial de Meta.
//
// Fuera de una ventana de conversación de 24 horas **sólo se puede mandar una
// plantilla aprobada**, con sus parámetros numerados. Nada de texto libre. Por
// eso el mensaje se manda como `template` y no como `text`: los avisos de turno
// siempre caen fuera de esa ventana.
//
// Los nombres de los campos los impone Meta y por eso quedan en inglés.
import type { MensajeArmado } from '../plantillas';
import type { Canal, ResultadoEnvio } from './canal';

const VERSION_API = 'v21.0';
const TIEMPO_LIMITE_MS = 15_000;

/** Idioma con el que se registraron las plantillas en Meta. */
const IDIOMA = 'es_AR';

interface RespuestaEnvio {
  messages?: { id?: string }[];
  error?: { message?: string; code?: number; error_subcode?: number };
}

/**
 * Códigos de error de Meta que no tiene sentido reintentar.
 *
 * Son problemas del destino o de la plantilla, no del momento: volver a
 * intentar da el mismo resultado y sólo retrasa el aviso a gerencia.
 */
const CODIGOS_DEFINITIVOS = new Set([
  131_026, // El número no existe o no puede recibir mensajes.
  131_047, // Hace falta reabrir la conversación con una plantilla.
  132_000, // La cantidad de parámetros no coincide con la plantilla.
  132_001, // La plantilla no existe o no está aprobada.
  132_005, // El texto del parámetro es demasiado largo.
  132_007, // El parámetro viola el formato de la plantilla.
  133_010, // El número no está registrado.
]);

export class CanalWhatsApp implements Canal {
  readonly nombre = 'whatsapp';

  constructor(
    private readonly token: string,
    private readonly idTelefono: string,
  ) {}

  async enviar(destino: string, mensaje: MensajeArmado): Promise<ResultadoEnvio> {
    const cuerpo = {
      messaging_product: 'whatsapp',
      to: destino,
      type: 'template',
      template: {
        name: mensaje.plantilla,
        language: { code: IDIOMA },
        components: [
          {
            type: 'body',
            parameters: mensaje.parametros.map((valor) => ({ type: 'text', text: valor })),
          },
        ],
      },
    };

    let respuesta: Response;

    try {
      respuesta = await fetch(
        `https://graph.facebook.com/${VERSION_API}/${this.idTelefono}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(cuerpo),
          signal: AbortSignal.timeout(TIEMPO_LIMITE_MS),
        },
      );
    } catch (error: unknown) {
      // Red caída o corte de espera: vale la pena reintentar.
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Fallo de red.',
        reintentable: true,
      };
    }

    const datos = (await respuesta.json().catch(() => null)) as RespuestaEnvio | null;

    if (respuesta.ok) {
      return { ok: true, idExterno: datos?.messages?.[0]?.id ?? null };
    }

    const codigo = datos?.error?.code ?? 0;
    const detalle = datos?.error?.message ?? `HTTP ${String(respuesta.status)}`;

    return {
      ok: false,
      error: `WhatsApp ${String(codigo)}: ${detalle}`,
      // 5xx y límites de tasa son pasajeros; los códigos de arriba, no.
      reintentable:
        !CODIGOS_DEFINITIVOS.has(codigo) && (respuesta.status >= 500 || respuesta.status === 429),
    };
  }
}
