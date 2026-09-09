// Crea el pool de PostgreSQL y la instancia de Drizzle usada por la API y el worker.
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as esquemas from './esquemas/index';

export interface OpcionesConexion {
  /** Cadena de conexión. La API usa la agrupada; el worker, la directa. */
  url: string;
  /** Cantidad máxima de conexiones simultáneas del pool. */
  maximoConexiones?: number;
}

export function crearConexion({ url, maximoConexiones = 10 }: OpcionesConexion) {
  if (!url) {
    throw new Error('Falta la cadena de conexión a PostgreSQL.');
  }

  const pool = new Pool({ connectionString: url, max: maximoConexiones });

  return {
    pool,
    bd: drizzle(pool, { schema: esquemas }),
  };
}

export type ConexionBaseDatos = ReturnType<typeof crearConexion>;
export type BaseDatos = ConexionBaseDatos['bd'];
