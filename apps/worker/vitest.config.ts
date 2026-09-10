// Configuración de pruebas del worker.
// Las de la bandeja de salida levantan PostgreSQL en proceso con PGlite.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
