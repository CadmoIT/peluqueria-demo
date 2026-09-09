// Arranque de la API con PostgreSQL en memoria.
//
// Levanta PGlite (PostgreSQL compilado a WebAssembly) dentro del propio
// proceso, le aplica las migraciones y carga las semillas. Sirve para trabajar
// en el frontend sin instalar Docker ni depender de una base externa.
//
// Los datos viven sólo en memoria: al cortar el proceso se pierde todo. Nunca
// se usa en staging ni en producción, donde va PostgreSQL de verdad.
import 'reflect-metadata';
// Tiene que ir antes de app.module: fija el entorno que su validación exige.
import './configuracion/entorno-memoria';

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';

import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  asegurarConfiguracion,
  cargarDemostracion,
  CARPETA_MIGRACIONES,
  SEPARADOR_SENTENCIAS,
  type BaseDatos,
} from '@manly/base-datos';
import { drizzle } from 'drizzle-orm/pglite';
import helmet from 'helmet';

import { BASE_DATOS } from './comun/base-datos/base-datos.modulo';
import { ExcepcionHttpFiltro } from './comun/filtros/excepcion-http.filtro';

const PUERTO = Number(process.env.API_PUERTO ?? 3001);
const PREFIJO = process.env.API_PREFIJO ?? 'api/v1';

async function crearBaseEnMemoria(): Promise<BaseDatos> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { btree_gist } = await import('@electric-sql/pglite/contrib/btree_gist');

  const cliente = new PGlite({ extensions: { btree_gist } });

  for (const archivo of readdirSync(CARPETA_MIGRACIONES)
    .filter((nombre) => nombre.endsWith('.sql'))
    .sort()) {
    for (const sentencia of readFileSync(join(CARPETA_MIGRACIONES, archivo), 'utf8')
      .split(SEPARADOR_SENTENCIAS)
      .map((trozo) => trozo.trim())
      .filter(Boolean)) {
      await cliente.exec(sentencia);
    }
  }

  const bd = drizzle(cliente as never) as unknown as BaseDatos;

  await asegurarConfiguracion(bd);
  await cargarDemostracion(bd);

  return bd;
}

async function arrancar(): Promise<void> {
  const bd = await crearBaseEnMemoria();

  // Se arma la aplicación real y se sustituye únicamente el proveedor de la
  // conexión. Todo lo demás —módulos, controladores, validación— es el mismo
  // código que corre en producción.
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(BASE_DATOS)
    .useValue(bd)
    .compile();

  const aplicacion = modulo.createNestApplication();

  aplicacion.use(helmet());
  aplicacion.enableCors({ origin: true, credentials: true });
  aplicacion.setGlobalPrefix(PREFIJO);
  aplicacion.useGlobalFilters(new ExcepcionHttpFiltro());

  const documento = new DocumentBuilder()
    .setTitle('API de reservas de Manly (memoria)')
    .setVersion('1.0')
    .build();

  SwaggerModule.setup(`${PREFIJO}/documentacion`, aplicacion, () =>
    SwaggerModule.createDocument(aplicacion, documento),
  );

  await aplicacion.listen(PUERTO, '0.0.0.0');

  console.warn(`API en memoria escuchando en http://localhost:${String(PUERTO)}/${PREFIJO}`);
  console.warn('Los datos se pierden al cortar el proceso.');
}

arrancar().catch((error: unknown) => {
  console.error('No se pudo arrancar la API en memoria:', error);
  process.exit(1);
});
