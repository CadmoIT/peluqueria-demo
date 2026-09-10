// Validación de la firma de los webhooks de Mercado Pago.
//
// El endpoint del webhook es público: cualquiera puede llegar a él. Sin firma,
// bastaría con inventar una notificación de "pago aprobado" para confirmarse un
// turno sin pagar. Esta comprobación es lo único que separa una notificación
// legítima de una falsificada.
//
// Mercado Pago manda dos cabeceras:
//
//   x-signature:  ts=1704908010,v1=618c8534...
//   x-request-id: un identificador de la petición
//
// y arma el mensaje firmado con el identificador del recurso, esas dos piezas y
// el secreto compartido.
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface DatosFirma {
  /** Contenido de la cabecera `x-signature`. */
  cabeceraFirma: string | undefined;
  /** Contenido de la cabecera `x-request-id`. */
  idPeticion: string | undefined;
  /** Identificador del recurso notificado, que llega en `data.id`. */
  idRecurso: string | undefined;
  /** Secreto de la integración, configurado en el panel de Mercado Pago. */
  secreto: string;
  /** Ahora, en milisegundos. Se inyecta para poder probarlo. */
  ahora?: number;
}

export type ResultadoFirma = { valida: true } | { valida: false; motivo: string };

/**
 * Tolerancia del reloj para la marca de tiempo firmada.
 *
 * Sin este límite, una notificación legítima capturada hoy podría reenviarse
 * dentro de un mes y seguiría validando. Cinco minutos alcanza para absorber
 * la diferencia de relojes entre servidores sin dejar la puerta abierta.
 */
const TOLERANCIA_MS = 5 * 60_000;

/** Parte `ts=...,v1=...` en sus piezas. */
function partirCabecera(cabecera: string): { ts?: string; v1?: string } {
  const piezas: { ts?: string; v1?: string } = {};

  for (const parte of cabecera.split(',')) {
    const separador = parte.indexOf('=');

    if (separador === -1) continue;

    const clave = parte.slice(0, separador).trim();
    const valor = parte.slice(separador + 1).trim();

    if (clave === 'ts') piezas.ts = valor;
    if (clave === 'v1') piezas.v1 = valor;
  }

  return piezas;
}

/** Compara dos firmas en tiempo constante, sin filtrar información por el tiempo. */
function sonIguales(unaHex: string, otraHex: string): boolean {
  if (unaHex.length !== otraHex.length) return false;

  try {
    return timingSafeEqual(Buffer.from(unaHex, 'hex'), Buffer.from(otraHex, 'hex'));
  } catch {
    // Alguna de las dos no era hexadecimal válido.
    return false;
  }
}

/**
 * Verifica que la notificación venga realmente de Mercado Pago.
 *
 * Devuelve el motivo del rechazo para poder registrarlo, pero ese motivo nunca
 * se le responde a quien llama: decirle a un atacante si falló la marca de
 * tiempo o la firma le ahorra trabajo.
 */
export function verificarFirmaWebhook(datos: DatosFirma): ResultadoFirma {
  const { cabeceraFirma, idPeticion, idRecurso, secreto, ahora = Date.now() } = datos;

  if (!secreto) {
    return { valida: false, motivo: 'No hay secreto de webhook configurado.' };
  }

  if (!cabeceraFirma) {
    return { valida: false, motivo: 'Falta la cabecera x-signature.' };
  }

  if (!idRecurso) {
    return { valida: false, motivo: 'Falta el identificador del recurso.' };
  }

  const { ts, v1 } = partirCabecera(cabeceraFirma);

  if (!ts || !v1) {
    return { valida: false, motivo: 'La cabecera x-signature está mal formada.' };
  }

  const marcaTiempo = Number(ts);

  if (!Number.isFinite(marcaTiempo)) {
    return { valida: false, motivo: 'La marca de tiempo no es un número.' };
  }

  // La marca viene en segundos.
  const desfase = Math.abs(ahora - marcaTiempo * 1000);

  if (desfase > TOLERANCIA_MS) {
    return { valida: false, motivo: 'La notificación está fuera de la ventana de tiempo.' };
  }

  // Mercado Pago normaliza a minúsculas el identificador cuando trae letras.
  const recursoNormalizado = /[a-zA-Z]/.test(idRecurso) ? idRecurso.toLowerCase() : idRecurso;

  const mensaje =
    `id:${recursoNormalizado};` + (idPeticion ? `request-id:${idPeticion};` : '') + `ts:${ts};`;

  const esperada = createHmac('sha256', secreto).update(mensaje).digest('hex');

  if (!sonIguales(esperada, v1)) {
    return { valida: false, motivo: 'La firma no coincide.' };
  }

  return { valida: true };
}

/**
 * Arma la firma de una notificación.
 *
 * Sólo se usa para simular notificaciones en desarrollo y en las pruebas: en
 * producción quien firma es Mercado Pago.
 */
export function firmarNotificacion(parametros: {
  idRecurso: string;
  idPeticion: string;
  secreto: string;
  ahora?: number;
}): { cabeceraFirma: string; idPeticion: string } {
  const ts = Math.floor((parametros.ahora ?? Date.now()) / 1000);
  const recursoNormalizado = /[a-zA-Z]/.test(parametros.idRecurso)
    ? parametros.idRecurso.toLowerCase()
    : parametros.idRecurso;

  const mensaje = `id:${recursoNormalizado};request-id:${parametros.idPeticion};ts:${String(ts)};`;
  const v1 = createHmac('sha256', parametros.secreto).update(mensaje).digest('hex');

  return {
    cabeceraFirma: `ts=${String(ts)},v1=${v1}`,
    idPeticion: parametros.idPeticion,
  };
}
