// Reporte de errores de la API.
//
// **Se importa antes que cualquier otra cosa** en `main.ts`: el SDK instrumenta
// módulos de Node —http, pg— y para hacerlo tiene que cargarse antes de que
// esos módulos los use alguien. Si se inicializa después, funciona a medias y
// no avisa.
//
// Sin `SENTRY_DSN` no hace nada, igual que la pasarela simulada: `pnpm dev` y
// las pruebas corren sin configurar nada y sin mandar un solo evento.
//
// Lo que sale de acá pasa antes por `limpiarEvento`, que es la única barrera
// entre este sistema y el servidor de un tercero. Ver `@manly/observabilidad`.
import { limpiarEvento, type EventoReportable } from '@manly/observabilidad';
import * as Sentry from '@sentry/node';

/**
 * Arranca el reporte de errores, si hay dónde reportar.
 *
 * Devuelve si quedó activo, para que el arranque lo deje dicho en el registro:
 * descubrir que no estaba andando el día que hace falta es tarde.
 */
export function iniciarObservabilidad(): boolean {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.npm_package_version,

    // Sin trazas de rendimiento. Este sistema atiende una peluquería, no tiene
    // un problema de escala, y cada traza es una petición más que sale con
    // datos adentro. Se enciende el día que haga falta medir algo concreto.
    tracesSampleRate: 0,

    // El SDK manda el cuerpo de las peticiones por defecto. Acá eso serían los
    // datos de quien reserva.
    sendDefaultPii: false,

    // Los tipos del SDK cambian entre versiones y `@manly/observabilidad` no
    // depende de él a propósito: la política de qué sale se prueba sin levantar
    // nada. La conversión vive acá, en el borde, que es donde corresponde.
    beforeSend: (evento) =>
      limpiarEvento(evento as unknown as EventoReportable) as unknown as typeof evento,
    beforeBreadcrumb: (miga) => {
      const [limpia] = limpiarEvento({ breadcrumbs: [miga] }).breadcrumbs ?? [];

      return (limpia ?? miga) as typeof miga;
    },
  });

  return true;
}

/**
 * Reporta una excepción con el contexto mínimo para ubicarla.
 *
 * La ruta va limpia de tokens; el resto del contexto lo agrega el SDK.
 */
export function reportarExcepcion(
  excepcion: unknown,
  contexto: { ruta: string; metodo: string; usuarioId?: string },
): void {
  Sentry.withScope((alcance) => {
    alcance.setTag('metodo', contexto.metodo);
    alcance.setContext('peticion', { ruta: contexto.ruta });

    if (contexto.usuarioId) {
      alcance.setUser({ id: contexto.usuarioId });
    }

    Sentry.captureException(excepcion);
  });
}

/** Espera a que salga lo pendiente. Se llama al apagar el proceso. */
export async function cerrarObservabilidad(): Promise<void> {
  await Sentry.close(2000);
}
