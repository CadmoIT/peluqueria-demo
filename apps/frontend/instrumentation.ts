// Reporte de errores del lado del servidor de Next.
//
// Lo llama Next una vez por proceso, antes de atender la primera petición.
// Cubre el renderizado en servidor y las rutas de servidor; el navegador va por
// `instrumentation-client.ts`.
import { limpiarEvento, type EventoReportable } from '@manly/observabilidad';

export async function register(): Promise<void> {
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

  if (!dsn) return;

  const Sentry = await import('@sentry/nextjs');

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend: (evento) =>
      limpiarEvento(evento as unknown as EventoReportable) as unknown as typeof evento,
  });
}

/** Next reporta acá los errores de renderizado en servidor. */
export async function onRequestError(
  ...argumentos: Parameters<typeof import('@sentry/nextjs').captureRequestError>
): Promise<void> {
  if (!(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN)) return;

  const Sentry = await import('@sentry/nextjs');

  Sentry.captureRequestError(...argumentos);
}
