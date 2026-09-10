// Configuración de Next.js para la web pública y el panel.
import type { NextConfig } from 'next';

const configuracion: NextConfig = {
  reactStrictMode: true,
  // Los paquetes internos se compilan desde su fuente TypeScript.
  transpilePackages: ['@manly/interfaz', '@manly/contratos'],
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  eslint: {
    // El linteo corre como tarea propia de Turborepo, no dentro del build.
    ignoreDuringBuilds: true,
  },

  /**
   * Saca del paquete lo que Sentry no va a usar.
   *
   * El SDK trae medición de rendimiento y grabación de sesión. Las dos están
   * apagadas en `instrumentation-client.ts` —la grabación registra lo que la
   * persona escribe, que en el formulario de reserva es su nombre, su teléfono
   * y su correo—, pero el código viaja igual si no se lo excluye.
   *
   * Sin esto el paquete compartido crecía de 102 a 185 kB. Este sitio existe
   * para que alguien saque un turno desde el teléfono, muchas veces con mala
   * señal: 80 kB de más en el arranque se pagan en turnos que no se sacan.
   */
  webpack(configuracion, { webpack }) {
    configuracion.plugins.push(
      new webpack.DefinePlugin({
        __SENTRY_TRACING__: false,
        __RRWEB_EXCLUDE_SHADOW_DOM__: true,
        __RRWEB_EXCLUDE_IFRAME__: true,
        __SENTRY_EXCLUDE_REPLAY_WORKER__: true,
      }),
    );

    return configuracion;
  },

  /**
   * Cabeceras de seguridad de la web.
   *
   * La API ya manda las suyas con helmet; esto es para lo que sirve Next. No
   * hay política de contenido acá: una CSP mal armada rompe el sitio de formas
   * difíciles de ver, y merece pasar por staging antes de encenderse. Las tres
   * que sí van son las que no tienen contraparte.
   */
  async headers() {
    return [
      {
        source: '/:ruta*',
        headers: [
          // Sin esto, un archivo servido con el tipo equivocado puede
          // interpretarse como script.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // El panel dentro de un iframe ajeno permitiría engañar a quien lo
          // usa para que haga clic donde no cree.
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          // El enlace privado de gestión viaja en la URL: sin esta cabecera,
          // salir del sitio por un enlace externo se lo filtraría al destino
          // en el Referer.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default configuracion;
