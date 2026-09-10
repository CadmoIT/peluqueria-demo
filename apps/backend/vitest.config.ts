// Configuración de pruebas unitarias de la API.
import { defineConfig } from 'vitest/config';

export default defineConfig({
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
