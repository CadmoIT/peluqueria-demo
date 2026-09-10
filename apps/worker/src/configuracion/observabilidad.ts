// Reporte de errores del worker.
//
// Acá importa más que en la API, y por una razón concreta: **un trabajo que
// falla no le devuelve un error a nadie**. Si el despachador revienta al mandar
// un aviso, no hay una pantalla que se ponga roja ni un cliente que reclame en
// el momento; pg-boss lo reintenta, se agota, y el problema aparece días después
// cuando alguien no se presenta a su turno.
//
// Sin `SENTRY_DSN` no hace nada. Igual que en la API.
import { limpiarEvento, type EventoReportable } from '@manly/observabilidad';
import * as Sentry from '@sentry/node';

export function iniciarObservabilidad(): boolean {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.npm_package_version,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend: (evento) =>
      limpiarEvento(evento as unknown as EventoReportable) as unknown as typeof evento,
  });

  return true;
}

/**
 * Reporta la falla de un trabajo, diciendo cuál.
 *
 * El nombre de la cola es lo primero que se necesita saber: no es lo mismo que
 * se haya caído el que expira retenciones —bloquea la agenda— que el que
 * concilia pagos.
 */
export function reportarFalloDeTrabajo(cola: string, error: unknown): void {
  Sentry.withScope((alcance) => {
    alcance.setTag('cola', cola);
    Sentry.captureException(error);
  });
}

export async function cerrarObservabilidad(): Promise<void> {
  await Sentry.close(2000);
}
