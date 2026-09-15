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
  listarProfesionalesAdmin,
  SEPARADOR_SENTENCIAS,
  vincularProfesionalConUsuario,
  type BaseDatos,
} from '@manly/base-datos';
import { drizzle } from 'drizzle-orm/pglite';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { BASE_DATOS } from './comun/base-datos/base-datos.modulo';
import { ExcepcionHttpFiltro } from './comun/filtros/excepcion-http.filtro';
import { AutenticacionServicio } from './modulos/autenticacion/autenticacion.servicio';

const PUERTO = Number(process.env.API_PUERTO ?? 3001);
const PREFIJO = process.env.API_PREFIJO ?? 'api/v1';

/**
 * Cuentas del modo memoria. Nunca salen de este archivo.
 *
 * Son dos porque el panel no se ve igual desde los dos lados: gerencia
 * administra todo y el profesional sólo su agenda y su horario. Con una sola
 * cuenta, la mitad de las pantallas no se puede probar sin inventar datos a
 * mano.
 */
const CUENTAS_DEMO = {
  gerencia: {
    email: 'gerencia@manly.local',
    contrasenia: 'panel-de-desarrollo',
    nombre: 'Gerencia',
  },
  profesional: {
    email: 'peluquero@manly.local',
    contrasenia: 'panel-de-desarrollo',
    nombre: 'Peluquero',
  },
} as const;

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
  aplicacion.use(cookieParser());
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

  // Cuentas listas para entrar al panel. Existen **sólo acá**: la base en
  // memoria no llega a ningún entorno real. En producción el primer acceso se
  // crea con el comando `invitar`.
  const autenticacion = modulo.get(AutenticacionServicio);

  async function crearCuenta(
    cuenta: { email: string; contrasenia: string; nombre: string },
    rol: 'gerencia' | 'profesional',
  ) {
    const invitacion = await autenticacion.invitar({
      email: cuenta.email,
      nombre: cuenta.nombre,
      rol,
    });

    await autenticacion.aceptarInvitacion(
      invitacion.url.split('/').pop() ?? '',
      cuenta.contrasenia,
    );

    return invitacion.usuarioId;
  }

  await crearCuenta(CUENTAS_DEMO.gerencia, 'gerencia');
  const usuarioProfesional = await crearCuenta(CUENTAS_DEMO.profesional, 'profesional');

  // Sin esta atadura el usuario tiene el rol pero no es nadie: no hay agenda
  // que mostrarle ni horario que dejarle editar.
  const [primerProfesional] = await listarProfesionalesAdmin(bd);

  if (primerProfesional) {
    await vincularProfesionalConUsuario(bd, primerProfesional.id, usuarioProfesional);
  }

  await aplicacion.listen(PUERTO, '0.0.0.0');

  console.warn(`API en memoria escuchando en http://localhost:${String(PUERTO)}/${PREFIJO}`);
  console.warn('Los datos se pierden al cortar el proceso.');
  console.warn(
    `Panel gerencia:    ${CUENTAS_DEMO.gerencia.email} / ${CUENTAS_DEMO.gerencia.contrasenia}`,
  );
  console.warn(
    `Panel profesional: ${CUENTAS_DEMO.profesional.email} / ${CUENTAS_DEMO.profesional.contrasenia}`,
  );
}

arrancar().catch((error: unknown) => {
  console.error('No se pudo arrancar la API en memoria:', error);
  process.exit(1);
});
