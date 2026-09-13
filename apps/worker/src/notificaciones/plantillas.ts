// Plantillas de los mensajes.
//
// Lógica pura: reciben los datos que se copiaron al encolar y devuelven el
// texto. No consultan la base ni la hora actual, así que el mensaje sale igual
// hoy que cuando se reintente mañana.
//
// **WhatsApp no permite texto libre** fuera de la ventana de 24 horas de una
// conversación: hay que usar plantillas aprobadas por Meta, con parámetros
// numerados. Por eso cada tipo declara el nombre de su plantilla y el orden
// exacto de sus parámetros, que es lo que hay que registrar en el panel de Meta.
// El email no tiene esa restricción y se arma libremente.
import { DateTime } from 'luxon';

export type TipoMensaje =
  | 'confirmacion'
  | 'recordatorio_primero'
  | 'recordatorio_segundo'
  | 'cancelacion'
  | 'reprogramacion'
  | 'solicitud_aprobada'
  | 'solicitud_rechazada';

/** Lo que se copia al encolar y alcanza para armar cualquier mensaje. */
export interface DatosMensaje {
  clienteNombre: string;
  sucursalNombre: string;
  sucursalDireccion: string;
  /** Instante del turno en ISO. Se formatea con la zona del negocio. */
  comienzaEn: string;
  servicios: string[];
  /** Enlace privado para ver o cambiar el turno. */
  urlGestion: string;
  /** Anticipación mínima para cambiar sin pedir autorización. */
  horasMinimasCancelacion: number;
}

export interface MensajeArmado {
  /** Nombre de la plantilla aprobada en Meta. Sólo aplica a WhatsApp. */
  plantilla: string;
  /** Parámetros en el orden que espera la plantilla de Meta. */
  parametros: string[];
  /** Asunto del email. */
  asunto: string;
  /** Cuerpo en texto plano, que sirve para email y para el registro. */
  texto: string;
}

const ZONA = 'America/Argentina/Buenos_Aires';

/** `jueves 10 de septiembre a las 15:30`. */
function cuando(iso: string): string {
  const fecha = DateTime.fromISO(iso, { zone: ZONA }).setLocale('es-AR');

  return `${fecha.toFormat("cccc d 'de' LLLL")} a las ${fecha.toFormat('HH:mm')}`;
}

/**
 * Dónde es el turno, como un solo valor.
 *
 * Va junto y no en dos parámetros porque WhatsApp sólo manda lo que está en
 * `parametros`: la dirección quedaba en el texto del correo pero fuera de la
 * plantilla, así que el mismo aviso decía la dirección por correo y no la decía
 * por WhatsApp. Un solo parámetro mantiene los dos canales diciendo lo mismo.
 */
function donde(datos: DatosMensaje): string {
  return `${datos.sucursalNombre} — ${datos.sucursalDireccion}`;
}

function listaDeServicios(servicios: string[]): string {
  if (servicios.length <= 1) return servicios[0] ?? 'tu turno';

  return `${servicios.slice(0, -1).join(', ')} y ${servicios[servicios.length - 1] ?? ''}`;
}

/**
 * Catálogo de plantillas.
 *
 * El nombre y el orden de los parámetros son un contrato con Meta: cambiarlos
 * exige volver a pedir aprobación de la plantilla.
 */
const CATALOGO: Record<TipoMensaje, (datos: DatosMensaje) => MensajeArmado> = {
  confirmacion: (datos) => ({
    plantilla: 'manly_confirmacion_turno',
    parametros: [
      datos.clienteNombre,
      listaDeServicios(datos.servicios),
      cuando(datos.comienzaEn),
      donde(datos),
      datos.urlGestion,
    ],
    asunto: `Tu turno en Manly quedó confirmado`,
    texto:
      `Hola ${datos.clienteNombre}, tu turno quedó confirmado.\n\n` +
      `${listaDeServicios(datos.servicios)}\n` +
      `${cuando(datos.comienzaEn)}\n` +
      `${donde(datos)}\n\n` +
      `Si necesitás cambiarlo o cancelarlo, entrá acá:\n${datos.urlGestion}\n\n` +
      `Podés hacerlo solo hasta ${String(datos.horasMinimasCancelacion)} horas antes.`,
  }),

  recordatorio_primero: (datos) => ({
    plantilla: 'manly_recordatorio_turno',
    parametros: [datos.clienteNombre, cuando(datos.comienzaEn), donde(datos), datos.urlGestion],
    asunto: `Te esperamos mañana en Manly`,
    texto:
      `Hola ${datos.clienteNombre}, te recordamos tu turno.\n\n` +
      `${cuando(datos.comienzaEn)}\n` +
      `${donde(datos)}\n\n` +
      `Si no vas a poder venir, avisanos acá:\n${datos.urlGestion}`,
  }),

  recordatorio_segundo: (datos) => ({
    plantilla: 'manly_recordatorio_proximo',
    parametros: [datos.clienteNombre, cuando(datos.comienzaEn), donde(datos)],
    asunto: `Tu turno en Manly es en un rato`,
    texto:
      `Hola ${datos.clienteNombre}, tu turno es hoy ${cuando(datos.comienzaEn)}.\n\n` +
      `Te esperamos en ${donde(datos)}.`,
  }),

  cancelacion: (datos) => ({
    plantilla: 'manly_turno_cancelado',
    parametros: [datos.clienteNombre, cuando(datos.comienzaEn)],
    asunto: `Cancelamos tu turno en Manly`,
    texto:
      `Hola ${datos.clienteNombre}, cancelamos tu turno del ${cuando(datos.comienzaEn)}.\n\n` +
      `Cuando quieras sacar otro, estamos acá.`,
  }),

  reprogramacion: (datos) => ({
    plantilla: 'manly_turno_reprogramado',
    parametros: [datos.clienteNombre, cuando(datos.comienzaEn), donde(datos), datos.urlGestion],
    asunto: `Movimos tu turno en Manly`,
    texto:
      `Hola ${datos.clienteNombre}, tu turno quedó para el ${cuando(datos.comienzaEn)}.\n\n` +
      `${donde(datos)}\n\n` +
      `Podés verlo acá:\n${datos.urlGestion}`,
  }),

  solicitud_aprobada: (datos) => ({
    plantilla: 'manly_solicitud_aprobada',
    parametros: [datos.clienteNombre, cuando(datos.comienzaEn), datos.urlGestion],
    asunto: `Aprobamos tu pedido`,
    texto:
      `Hola ${datos.clienteNombre}, aprobamos tu pedido sobre el turno del ` +
      `${cuando(datos.comienzaEn)}.\n\nMirá cómo quedó acá:\n${datos.urlGestion}`,
  }),

  solicitud_rechazada: (datos) => ({
    plantilla: 'manly_solicitud_rechazada',
    parametros: [datos.clienteNombre, cuando(datos.comienzaEn), datos.urlGestion],
    asunto: `Sobre tu pedido de cambio`,
    texto:
      `Hola ${datos.clienteNombre}, no pudimos aprobar tu pedido sobre el turno del ` +
      `${cuando(datos.comienzaEn)}, así que sigue en pie.\n\n` +
      `Escribinos si necesitás resolverlo de otra forma:\n${datos.urlGestion}`,
  }),
};

/** Arma el mensaje de un tipo con los datos que se guardaron al encolar. */
export function armarMensaje(tipo: TipoMensaje, datos: DatosMensaje): MensajeArmado {
  const constructor = CATALOGO[tipo];

  if (!constructor) {
    throw new Error(`No hay plantilla para el tipo ${tipo}.`);
  }

  return constructor(datos);
}

/** Todos los tipos, para poder listar las plantillas que hay que dar de alta. */
export const TIPOS_MENSAJE = Object.keys(CATALOGO) as TipoMensaje[];
