// Configuración de pruebas del paquete de base de datos.
// Las pruebas levantan PostgreSQL en proceso con PGlite, así que no hacen falta
// ni Docker ni una base externa; a cambio tardan más que una prueba unitaria.
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
