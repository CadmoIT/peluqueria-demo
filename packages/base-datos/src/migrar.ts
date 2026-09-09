// Aplica las migraciones pendientes contra la base configurada.
// Se ejecuta desde CI y desde los despliegues, siempre con la conexión directa:
// el DDL toma locks de sesión que el pooler de Neon no mantiene.
import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { crearConexion } from './conexion';
import { CARPETA_MIGRACIONES } from './migraciones';

async function principal(): Promise<void> {
  const url = process.env.DATABASE_URL_DIRECTA ?? process.env.DATABASE_URL;

  if (!url) {
    throw new Error('Falta DATABASE_URL_DIRECTA (o DATABASE_URL) para migrar.');
  }

  const { pool, bd } = crearConexion({ url, maximoConexiones: 1 });

  try {
    await migrate(bd, { migrationsFolder: CARPETA_MIGRACIONES });
    console.warn('Migraciones aplicadas correctamente.');
  } finally {
    await pool.end();
  }
}

// Sólo corre cuando se ejecuta el archivo directamente. Importarlo (por
// ejemplo desde una prueba) no debe disparar nada ni cortar el proceso.
if (require.main === module) {
  principal().catch((error: unknown) => {
    console.error('Fallo al aplicar las migraciones:', error);
    process.exit(1);
  });
}
