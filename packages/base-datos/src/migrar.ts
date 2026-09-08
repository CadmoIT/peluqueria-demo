// Aplica las migraciones pendientes contra la base configurada.
// Se ejecuta desde CI y desde los despliegues, siempre con la conexión directa.
import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { crearConexion } from './conexion.js';

async function principal(): Promise<void> {
  const url = process.env.DATABASE_URL_DIRECTA ?? process.env.DATABASE_URL;

  if (!url) {
    throw new Error('Falta DATABASE_URL_DIRECTA (o DATABASE_URL) para migrar.');
  }

  const { pool, bd } = crearConexion({ url, maximoConexiones: 1 });

  try {
    await migrate(bd, { migrationsFolder: new URL('./migraciones', import.meta.url).pathname });
    console.warn('Migraciones aplicadas correctamente.');
  } finally {
    await pool.end();
  }
}

principal().catch((error: unknown) => {
  console.error('Fallo al aplicar las migraciones:', error);
  process.exit(1);
});
