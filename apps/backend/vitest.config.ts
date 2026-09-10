// Configuración de pruebas de la API.
//
// El transformador es SWC y no el esbuild que trae Vitest por omisión. La razón
// es concreta: **esbuild no emite `design:paramtypes`**, la metadata que Nest
// usa para inyectar por tipo. Sin ella, un guardián declarado como
// `constructor(private readonly reflector: Reflector)` se construye con
// `undefined` y recién revienta cuando entra una petición.
//
// Eso no es teórico: pasó al escribir `comun/seguridad.integracion.spec.ts`.
// Toda la API devolvía 500 y las primeras aserciones —escritas como "no debe
// ser 429"— pasaban en verde igual. Con esbuild, cualquier prueba que arme la
// aplicación de verdad miente.
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    // Las pruebas de integración levantan PostgreSQL en proceso con PGlite, que
    // tarda un segundo o dos. Con el límite por defecto de 5 s fallaban al azar
    // cuando varios paquetes corrían en paralelo.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
    },
  },
});
