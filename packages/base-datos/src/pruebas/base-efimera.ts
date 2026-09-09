// Levanta una PostgreSQL efímera en proceso y le aplica las migraciones.
//
// Usa PGlite (PostgreSQL compilado a WebAssembly), así las pruebas de esquema
// corren sin Docker ni base externa, tanto en una máquina de desarrollo como en
// CI. Se ejecuta el mismo SQL que aplica el migrador en producción.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { PGlite } from '@electric-sql/pglite';

/** Instancia de PostgreSQL en proceso usada por las pruebas. */
export type BaseEfimera = PGlite;

const CARPETA_MIGRACIONES = join(__dirname, '..', '..', 'migraciones');

/** Separador que Drizzle intercala entre sentencias de una misma migración. */
const SEPARADOR = '--> statement-breakpoint';

/** Lee las migraciones en orden y devuelve sus sentencias. */
export function leerMigraciones(): string[] {
  const archivos = readdirSync(CARPETA_MIGRACIONES)
    .filter((nombre) => nombre.endsWith('.sql'))
    .sort();

  if (archivos.length === 0) {
    throw new Error(`No se encontraron migraciones en ${CARPETA_MIGRACIONES}`);
  }

  return archivos.flatMap((archivo) =>
    readFileSync(join(CARPETA_MIGRACIONES, archivo), 'utf8')
      .split(SEPARADOR)
      .map((sentencia) => sentencia.trim())
      .filter(Boolean),
  );
}

/** Crea una base nueva con todas las migraciones aplicadas. */
export async function crearBaseEfimera(): Promise<BaseEfimera> {
  // PGlite se publica como ESM y este paquete compila a CommonJS: la carga
  // tiene que ser dinámica. Sólo se usa en pruebas, nunca en producción.
  const { PGlite } = await import('@electric-sql/pglite');
  const { btree_gist } = await import('@electric-sql/pglite/contrib/btree_gist');

  // El mismo objeto en runtime, pero TypeScript ve dos tipos distintos según se
  // resuelva el paquete en modo require o import, porque PGlite tiene campos
  // privados. El puente se hace acá, una sola vez, para que el resto del código
  // (y drizzle-orm/pglite) trabaje con un único tipo.
  const bd = new PGlite({ extensions: { btree_gist } }) as unknown as BaseEfimera;

  for (const sentencia of leerMigraciones()) {
    await bd.exec(sentencia);
  }

  return bd;
}

/** Datos mínimos para poder crear una reserva en las pruebas. */
export interface Semilla {
  sucursalId: string;
  servicioId: string;
  servicioConBuffersId: string;
  profesionalId: string;
  otroProfesionalId: string;
}

export async function sembrarMinimo(bd: BaseEfimera): Promise<Semilla> {
  const sucursal = await bd.query<{ id: string }>(
    `INSERT INTO sucursales (nombre, barrio, direccion) VALUES ('Las Cañitas', 'Las Cañitas', 'Calle 1') RETURNING id`,
  );

  const servicio = await bd.query<{ id: string }>(
    `INSERT INTO servicios (nombre, duracion_minutos, precio_centavos)
     VALUES ('Corte', 45, 1500000) RETURNING id`,
  );

  // Mismo servicio pero con 15 minutos de limpieza posterior.
  const servicioConBuffers = await bd.query<{ id: string }>(
    `INSERT INTO servicios (nombre, duracion_minutos, precio_centavos, minutos_limpieza)
     VALUES ('Color', 60, 4000000, 15) RETURNING id`,
  );

  const profesional = await bd.query<{ id: string }>(
    `INSERT INTO profesionales (nombre) VALUES ('Ana') RETURNING id`,
  );

  const otroProfesional = await bd.query<{ id: string }>(
    `INSERT INTO profesionales (nombre) VALUES ('Beto') RETURNING id`,
  );

  return {
    sucursalId: sucursal.rows[0]!.id,
    servicioId: servicio.rows[0]!.id,
    servicioConBuffersId: servicioConBuffers.rows[0]!.id,
    profesionalId: profesional.rows[0]!.id,
    otroProfesionalId: otroProfesional.rows[0]!.id,
  };
}

/** Crea una reserva con su ventana total, sin bloques. */
export async function crearReserva(
  bd: BaseEfimera,
  semilla: Semilla,
  opciones: { comienzaEn: string; terminaEn: string; token: string },
): Promise<string> {
  const reserva = await bd.query<{ id: string }>(
    `INSERT INTO reservas (
       sucursal_id, cliente_nombre, canal_contacto, contacto_whatsapp,
       comienza_en, termina_en, precio_total_centavos,
       hash_token_gestion, acepto_condiciones_en
     ) VALUES ($1, 'Cliente', 'whatsapp', '5491100000000', $2, $3, 1500000, $4, now())
     RETURNING id`,
    [semilla.sucursalId, opciones.comienzaEn, opciones.terminaEn, opciones.token],
  );

  return reserva.rows[0]!.id;
}

/** Agrega un bloque a una reserva. `ocupa*` por defecto iguala la franja del servicio. */
export async function agregarBloque(
  bd: BaseEfimera,
  opciones: {
    reservaId: string;
    servicioId: string;
    profesionalId: string;
    orden?: number;
    comienzaEn: string;
    terminaEn: string;
    ocupaDesde?: string;
    ocupaHasta?: string;
  },
): Promise<void> {
  await bd.query(
    `INSERT INTO reservas_servicios (
       reserva_id, servicio_id, profesional_id, orden,
       comienza_en, termina_en, ocupa_desde, ocupa_hasta,
       servicio_nombre, duracion_minutos, precio_centavos
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Corte', 45, 1500000)`,
    [
      opciones.reservaId,
      opciones.servicioId,
      opciones.profesionalId,
      opciones.orden ?? 0,
      opciones.comienzaEn,
      opciones.terminaEn,
      opciones.ocupaDesde ?? opciones.comienzaEn,
      opciones.ocupaHasta ?? opciones.terminaEn,
    ],
  );
}
