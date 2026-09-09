// Configuración de drizzle-kit para generar y aplicar migraciones.
// Usa la conexión DIRECTA: el pooler no soporta las sentencias DDL con locks.
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/esquemas/index.ts',
  out: './migraciones',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL_DIRECTA ?? process.env.DATABASE_URL ?? '',
  },
  verbose: true,
  strict: true,
});
