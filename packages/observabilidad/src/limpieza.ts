// Qué se manda al servicio de errores y qué nunca sale de acá.
//
// Reportar errores implica mandarle a un tercero fragmentos de lo que estaba
// pasando cuando algo falló. En este sistema eso incluye cosas que no pueden
// salir:
//
//   1. **El token del enlace de gestión, que viaja en la URL.** No es un
//      identificador: es la credencial. Quien lo tenga puede ver y cancelar la
//      reserva de otra persona. Una URL como `/mi-reserva/abc123` guardada en el
//      panel de un proveedor es una llave dejada en la vereda.
//   2. **Los tokens de invitación y de recuperación**, por lo mismo.
//   3. **Los datos del cliente**: nombre, teléfono, correo. No hacen falta para
//      arreglar un error y no son nuestros para repartir.
//
// La política es incluir lo que sirve para diagnosticar —qué ruta, qué método,
// qué excepción— y nada más. Si para entender un error hace falta el dato de
// una persona, se mira en la base, con las credenciales del local.
//
// Este archivo no importa el SDK a propósito: es una política, y las políticas
// se prueban sin levantar nada.

/**
 * Rutas cuyo último segmento es un token.
 *
 * Se enumeran a mano y no se detecta por forma: un identificador de reserva y
 * un token se parecen lo suficiente como para que una heurística deje pasar
 * uno. Si aparece una ruta nueva con token, va acá.
 */
const RUTAS_CON_TOKEN = [
  '/mi-reserva/',
  '/panel/invitacion/',
  '/panel/recuperar/',
  '/pagos/estado/',
];

/** Lo que reemplaza a un valor que no puede salir. */
export const OCULTO = '[oculto]';

/**
 * Saca el token de una URL, dejando el resto legible.
 *
 * `/api/v1/mi-reserva/abc123/cancelar` queda `/api/v1/mi-reserva/[oculto]/cancelar`:
 * sigue diciendo qué se estaba haciendo, sin decir sobre qué reserva.
 */
export function limpiarUrl(url: string): string {
  let limpia = url;

  for (const prefijo of RUTAS_CON_TOKEN) {
    const posicion = limpia.indexOf(prefijo);

    if (posicion === -1) continue;

    const desde = posicion + prefijo.length;
    const hasta = limpia.indexOf('/', desde);
    const fin = hasta === -1 ? limpia.length : hasta;

    limpia = limpia.slice(0, desde) + OCULTO + limpia.slice(fin);
  }

  // La cadena de consulta se descarta entera. Hoy no lleva nada sensible, pero
  // alcanza con que alguien agregue un parámetro mañana para que empiece a
  // llevarlo, y ese cambio no se vería en ninguna revisión.
  const consulta = limpia.indexOf('?');

  return consulta === -1 ? limpia : `${limpia.slice(0, consulta)}?${OCULTO}`;
}

/** Claves cuyo valor nunca se manda, mire donde mire. */
const CLAVES_PROHIBIDAS = [
  'token',
  'contrasenia',
  'password',
  'authorization',
  'cookie',
  'email',
  'whatsapp',
  'telefono',
  'clientenombre',
  'contactoemail',
  'contactowhatsapp',
  'nombre',
  'destino',
  'urlgestion',
  'hashtokengestion',
  'hashcontrasenia',
];

function esProhibida(clave: string): boolean {
  const normalizada = clave.toLowerCase();

  return CLAVES_PROHIBIDAS.some((prohibida) => normalizada.includes(prohibida));
}

/**
 * Recorre un objeto y tapa los valores de las claves prohibidas.
 *
 * Va por lista negra de claves y no por detección de contenido: reconocer un
 * teléfono o un nombre dentro de un texto libre no se puede hacer bien, y una
 * heurística que falla el 5 % de las veces filtra el 5 % de los clientes.
 */
export function limpiarObjeto(valor: unknown, profundidad = 0): unknown {
  // Un tope de profundidad evita quedarse dando vueltas en una estructura
  // cíclica, que es fácil de armar con un objeto de petición.
  if (profundidad > 6) return OCULTO;

  if (Array.isArray(valor)) {
    return valor.map((elemento) => limpiarObjeto(elemento, profundidad + 1));
  }

  if (valor === null || typeof valor !== 'object') return valor;

  const salida: Record<string, unknown> = {};

  for (const [clave, contenido] of Object.entries(valor as Record<string, unknown>)) {
    if (esProhibida(clave)) {
      salida[clave] = OCULTO;
      continue;
    }

    // A **todo** texto se le pasa `limpiarUrl`, sin fijarse en cómo se llama la
    // clave. Antes sólo se limpiaban las claves con «url» adentro, y un
    // `{ ruta: '/mi-reserva/TOKEN' }` pasaba entero: el token salía igual.
    //
    // Para una cadena que no contiene ninguna ruta con token, `limpiarUrl` no
    // hace nada, así que no se pierde información por aplicarlo de más.
    salida[clave] =
      typeof contenido === 'string'
        ? limpiarUrl(contenido)
        : limpiarObjeto(contenido, profundidad + 1);
  }

  return salida;
}

/**
 * Forma mínima de un evento, para no atarse al tipo del SDK.
 *
 * Sólo se declara lo que se toca. Las versiones de Sentry cambian su tipo
 * `Event` seguido y este archivo no tiene por qué enterarse.
 */
export interface EventoReportable {
  request?: {
    url?: string;
    headers?: Record<string, string>;
    cookies?: unknown;
    data?: unknown;
    query_string?: unknown;
  };
  user?: Record<string, unknown>;
  breadcrumbs?: { data?: unknown; message?: string }[];
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  tags?: Record<string, unknown>;
  [otras: string]: unknown;
}

/**
 * Limpia un evento antes de que salga.
 *
 * Se engancha en `beforeSend` y en `beforeBreadcrumb`. Es el único lugar por
 * el que pasa todo lo que se manda, así que lo que no se tape acá, sale.
 */
export function limpiarEvento<T extends EventoReportable>(evento: T): T {
  const limpio: EventoReportable = { ...evento };

  if (limpio.request) {
    limpio.request = {
      ...limpio.request,
      ...(limpio.request.url === undefined ? {} : { url: limpiarUrl(limpio.request.url) }),
      // El cuerpo de la petición se descarta entero. Es donde viajan el nombre,
      // el teléfono y el correo de quien reserva, y no hace falta para saber por
      // qué falló una consulta.
      data: limpio.request.data === undefined ? undefined : OCULTO,
      cookies: limpio.request.cookies === undefined ? undefined : OCULTO,
      query_string: limpio.request.query_string === undefined ? undefined : OCULTO,
      ...(limpio.request.headers === undefined
        ? {}
        : { headers: limpiarObjeto(limpio.request.headers) as Record<string, string> }),
    };
  }

  // El usuario se identifica por su id, que no dice nada de nadie sin la base
  // adelante. El nombre y el correo no aportan al diagnóstico.
  if (limpio.user) {
    limpio.user = { id: limpio.user.id };
  }

  if (limpio.breadcrumbs) {
    limpio.breadcrumbs = limpio.breadcrumbs.map((miga) => ({
      ...miga,
      ...(miga.message === undefined ? {} : { message: limpiarUrl(miga.message) }),
      ...(miga.data === undefined ? {} : { data: limpiarObjeto(miga.data) }),
    }));
  }

  // `extra`, `contexts` y `tags` son lo que agrega quien reporta. Se limpian
  // los tres porque son la vía por la que un dato entra sin pasar por ningún
  // otro control: alcanza con que alguien haga `setContext('reserva', reserva)`
  // para mandar el nombre y el teléfono del cliente.
  //
  // Faltaba `contexts`, y se descubrió mandando un evento de prueba a un
  // receptor local y leyendo lo que salía. No se veía revisando el código: la
  // política parecía completa.
  for (const campo of ['extra', 'contexts', 'tags'] as const) {
    if (limpio[campo]) {
      limpio[campo] = limpiarObjeto(limpio[campo]) as Record<string, unknown>;
    }
  }

  return limpio as T;
}
