// Reporte de errores en el navegador.
//
// Lo carga Next automáticamente en el cliente. Sin `NEXT_PUBLIC_SENTRY_DSN` no
// hace nada: `pnpm dev` corre sin mandar un solo evento.
//
// Acá la limpieza importa más que en el servidor, porque el navegador es donde
// **la URL con el token está a la vista**: `/mi-reserva/abc123` es la página
// que la persona tiene abierta, y ese token es la credencial de su reserva. Sin
// limpiar, cada error de JavaScript la mandaría junto con la traza.
import { limpiarEvento, type EventoReportable } from '@manly/observabilidad';
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,

    // Sin trazas ni repetición de sesión. La repetición graba lo que la persona
    // ve y escribe: en el formulario de reserva eso es su nombre, su teléfono y
    // su correo. No se enciende.
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,

    sendDefaultPii: false,

    beforeSend: (evento) =>
      limpiarEvento(evento as unknown as EventoReportable) as unknown as typeof evento,
    beforeBreadcrumb: (miga) => {
      const [limpia] = limpiarEvento({ breadcrumbs: [miga] }).breadcrumbs ?? [];

      return (limpia ?? miga) as typeof miga;
    },
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
