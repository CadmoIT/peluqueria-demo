// Formato de precios y fechas para mostrar.
//
// Todo se presenta en la zona horaria del negocio, no en la del navegador: un
// turno a las 15:00 en Buenos Aires tiene que verse 15:00 aunque la persona
// esté mirando la página desde otro país.

const ZONA_NEGOCIO = 'America/Argentina/Buenos_Aires';
const LOCAL = 'es-AR';

/** Precio en pesos a partir de los centavos que devuelve la API. */
export function formatearPrecio(centavos: number): string {
  return new Intl.NumberFormat(LOCAL, {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(centavos / 100);
}

/**
 * Hora del turno, por ejemplo `15:30`.
 *
 * Se fuerza el reloj de 24 horas: el formato por defecto de es-AR devuelve
 * "3:30 p. m.", que no es como se dice ni se lee la hora acá.
 */
export function formatearHora(iso: string): string {
  return new Intl.DateTimeFormat(LOCAL, {
    timeZone: ZONA_NEGOCIO,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

/** Día completo, por ejemplo `jueves 1 de octubre`. */
export function formatearDia(iso: string): string {
  return new Intl.DateTimeFormat(LOCAL, {
    timeZone: ZONA_NEGOCIO,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(iso));
}

/** Día y hora juntos, para confirmaciones y recordatorios. */
export function formatearDiaYHora(iso: string): string {
  return `${formatearDia(iso)}, ${formatearHora(iso)}`;
}

/** Clave `AAAA-MM-DD` del día del negocio, para agrupar opciones. */
export function claveDelDia(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_NEGOCIO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

/** Duración legible: `1 h 15 min`. */
export function formatearDuracion(minutos: number): string {
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;

  if (horas === 0) return `${String(resto)} min`;
  if (resto === 0) return `${String(horas)} h`;

  return `${String(horas)} h ${String(resto)} min`;
}
