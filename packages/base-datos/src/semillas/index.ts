// Carga los datos iniciales de la base.
//
// Se divide en dos partes con criterios distintos:
//
//   1. La fila de `configuracion_negocio`, que el sistema necesita para
//      funcionar. Se crea en todos los entornos, producción incluida.
//   2. Datos de demostración (sucursales, servicios, profesionales) para poder
//      levantar el sitio en local. NO se cargan en producción: según el plan,
//      los datos reales se cargan desde el panel y no se importa nada de
//      AgendaPro.
//
// Es idempotente: correrla dos veces no duplica nada.
import { sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { crearConexion } from '../conexion';
import type * as esquemas from '../esquemas/index';
import {
  configuracionNegocio,
  profesionales,
  profesionalesServicios,
  profesionalesSucursales,
  servicios,
  serviciosSucursales,
  sucursales,
} from '../esquemas/index';

/**
 * Cualquier instancia de Drizzle sobre PostgreSQL sirve.
 * Se tipa así, y no con el driver concreto, para poder sembrar tanto la base
 * real como la PGlite en proceso de las pruebas.
 */
export type BaseSembrable = PgDatabase<PgQueryResultHKT, typeof esquemas>;

/** Crea la fila única de configuración si todavía no existe. */
export async function asegurarConfiguracion(bd: BaseSembrable): Promise<void> {
  const existentes = await bd.select({ id: configuracionNegocio.id }).from(configuracionNegocio);

  if (existentes.length > 0) {
    console.warn('La configuración del negocio ya existe: no se toca.');
    return;
  }

  await bd.insert(configuracionNegocio).values({});
  console.warn('Configuración del negocio creada con los valores por defecto.');
}

/** Sucursales de demostración. Las direcciones reales se cargan desde el panel. */
const SUCURSALES_DEMO = [
  {
    nombre: 'Las Cañitas',
    barrio: 'Las Cañitas, CABA',
    direccion: 'Pendiente de confirmar',
    orden: 0,
  },
  {
    nombre: 'Virrey Avilés',
    barrio: 'Colegiales, CABA',
    direccion: 'Pendiente de confirmar',
    orden: 1,
  },
  { nombre: 'Aguilar', barrio: 'Belgrano, CABA', direccion: 'Pendiente de confirmar', orden: 2 },
];

/** Servicios de demostración, con precios en centavos. */
const SERVICIOS_DEMO = [
  { nombre: 'Corte', duracionMinutos: 45, precioCentavos: 1_500_000, orden: 0 },
  { nombre: 'Corte y barba', duracionMinutos: 75, precioCentavos: 2_200_000, orden: 1 },
  { nombre: 'Barba', duracionMinutos: 30, precioCentavos: 900_000, orden: 2 },
  {
    nombre: 'Color',
    duracionMinutos: 60,
    precioCentavos: 4_000_000,
    minutosLimpieza: 15,
    modalidadSenia: 'porcentual' as const,
    seniaPorcentaje: 30,
    orden: 3,
  },
];

const PROFESIONALES_DEMO = ['Ana', 'Beto', 'Carla'];

export async function cargarDemostracion(bd: BaseSembrable): Promise<void> {
  const yaHay = await bd.select({ id: sucursales.id }).from(sucursales).limit(1);

  if (yaHay.length > 0) {
    console.warn('Ya hay sucursales cargadas: no se agregan datos de demostración.');
    return;
  }

  const sucursalesCreadas = await bd.insert(sucursales).values(SUCURSALES_DEMO).returning();
  const serviciosCreados = await bd.insert(servicios).values(SERVICIOS_DEMO).returning();
  const profesionalesCreados = await bd
    .insert(profesionales)
    .values(PROFESIONALES_DEMO.map((nombre, orden) => ({ nombre, orden })))
    .returning();

  // Todos los servicios en todas las sucursales, y todos los profesionales
  // habilitados en todo. La combinación fina se define desde el panel.
  await bd.insert(serviciosSucursales).values(
    serviciosCreados.flatMap((servicio) =>
      sucursalesCreadas.map((sucursal) => ({
        servicioId: servicio.id,
        sucursalId: sucursal.id,
      })),
    ),
  );

  await bd.insert(profesionalesSucursales).values(
    profesionalesCreados.flatMap((profesional) =>
      sucursalesCreadas.map((sucursal) => ({
        profesionalId: profesional.id,
        sucursalId: sucursal.id,
      })),
    ),
  );

  await bd.insert(profesionalesServicios).values(
    profesionalesCreados.flatMap((profesional) =>
      serviciosCreados.map((servicio) => ({
        profesionalId: profesional.id,
        servicioId: servicio.id,
      })),
    ),
  );

  // Lunes a sábado, de 10 a 20, para todos los profesionales en todas las sucursales.
  await bd.execute(sql`
    INSERT INTO horarios_semanales (profesional_id, sucursal_id, dia_semana, comienza, termina)
    SELECT ps.profesional_id, ps.sucursal_id, dia, '10:00', '20:00'
    FROM profesionales_sucursales ps
    CROSS JOIN generate_series(1, 6) AS dia
  `);

  console.warn(
    `Demostración cargada: ${String(sucursalesCreadas.length)} sucursales, ` +
      `${String(serviciosCreados.length)} servicios, ` +
      `${String(profesionalesCreados.length)} profesionales.`,
  );
}

async function principal(): Promise<void> {
  const url = process.env.DATABASE_URL_DIRECTA ?? process.env.DATABASE_URL;

  if (!url) {
    throw new Error('Falta DATABASE_URL_DIRECTA (o DATABASE_URL) para cargar las semillas.');
  }

  const esProduccion = process.env.NODE_ENV === 'production';
  const { pool, bd } = crearConexion({ url, maximoConexiones: 1 });

  try {
    await asegurarConfiguracion(bd);

    if (esProduccion) {
      console.warn('NODE_ENV=production: se omiten los datos de demostración.');
      return;
    }

    await cargarDemostracion(bd);
  } finally {
    await pool.end();
  }
}

// Sólo corre cuando se ejecuta el archivo directamente. Importarlo (por
// ejemplo desde una prueba) no debe disparar nada ni cortar el proceso.
if (require.main === module) {
  principal().catch((error: unknown) => {
    console.error('Fallo al cargar las semillas:', error);
    process.exit(1);
  });
}
