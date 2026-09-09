// Conexión a PostgreSQL del worker.
//
// Usa siempre DATABASE_URL_DIRECTA. pg-boss toma locks a nivel de sesión y el
// endpoint agrupado de Neon (PgBouncer en modo transacción) no los mantiene.
import { crearConexion, type ConexionBaseDatos } from '@manly/base-datos';

import { leerEntorno } from './entorno';

let conexion: ConexionBaseDatos | null = null;

export function obtenerConexion(): ConexionBaseDatos {
  conexion ??= crearConexion({ url: leerEntorno().DATABASE_URL_DIRECTA, maximoConexiones: 4 });

  return conexion;
}

export async function cerrarConexion(): Promise<void> {
  if (conexion) {
    await conexion.pool.end();
    conexion = null;
  }
}
