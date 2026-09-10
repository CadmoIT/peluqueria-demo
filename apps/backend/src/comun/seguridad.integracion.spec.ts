// Defensas transversales de la API, probadas sobre la aplicación real.
//
// Las tres que se verifican acá se rompen en silencio: si el guardián del
// limitador se cae del módulo, o si alguien saca una tubería de un parámetro,
// nada falla, nada avisa, y la API sigue respondiendo 200 hasta el día que
// alguien lo aprovecha. Por eso se prueban contra el grafo de módulos armado de
// verdad y no contra los guardianes por separado.
import 'reflect-metadata';
import '../configuracion/entorno-memoria';

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  asegurarConfiguracion,
  cargarDemostracion,
  CARPETA_MIGRACIONES,
  SEPARADOR_SENTENCIAS,
  type BaseDatos,
} from '@manly/base-datos';
import cookieParser from 'cookie-parser';
import { drizzle } from 'drizzle-orm/pglite';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { BASE_DATOS } from './base-datos/base-datos.modulo';
import { ExcepcionHttpFiltro } from './filtros/excepcion-http.filtro';

let aplicacion: INestApplication;
let cerrarBase: () => Promise<void>;

beforeAll(async () => {
  // Con base de verdad y no con un objeto vacío: la mitad de lo que se verifica
  // acá es qué código devuelve la API, y una conexión de mentira convierte cada
  // respuesta en 500, que es justamente lo que estas pruebas tienen que
  // distinguir de un 401 o un 404.
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

  cerrarBase = () => cliente.close();

  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(BASE_DATOS)
    .useValue(bd)
    .compile();

  aplicacion = modulo.createNestApplication({ logger: false });
  aplicacion.use(cookieParser());
  aplicacion.setGlobalPrefix('api/v1');
  aplicacion.useGlobalFilters(new ExcepcionHttpFiltro());

  await aplicacion.init();
});

afterAll(async () => {
  await aplicacion.close();
  await cerrarBase();
});

/**
 * Cada petición finge venir de una dirección distinta.
 *
 * El limitador cuenta por origen, así que sin esto las pruebas se pisarían
 * entre sí: la segunda arrancaría con el cupo que gastó la primera.
 */
function pedir(origen: string) {
  const servidor = aplicacion.getHttpServer() as Parameters<typeof request>[0];

  return {
    get: (ruta: string) => request(servidor).get(ruta).set('x-forwarded-for', origen),
    post: (ruta: string) => request(servidor).post(ruta).set('x-forwarded-for', origen),
  };
}

describe('límite de peticiones', () => {
  it('corta la fuerza bruta contra el ingreso al panel', async () => {
    const credenciales = { email: 'alguien@manly.ar', contrasenia: 'probando' };
    const codigos: number[] = [];

    for (let intento = 0; intento < 14; intento += 1) {
      const respuesta = await pedir('10.0.0.1')
        .post('/api/v1/panel/acceso/ingresar')
        .send(credenciales);

      codigos.push(respuesta.status);
    }

    // Los primeros diez llegan al servicio y rebotan por credenciales; del once
    // en adelante ni siquiera llegan.
    //
    // Se comprueba el 401 y no sólo "distinto de 429": una versión anterior de
    // esta prueba decía `not.toContain(429)` y pasaba en verde mientras la API
    // devolvía 500 en todas las rutas por un guardián mal construido.
    expect(codigos.slice(0, 10)).toEqual(Array.from({ length: 10 }, () => 401));
    expect(codigos.slice(10)).toEqual(Array.from({ length: 4 }, () => 429));
  });

  it('cuenta por origen y no entre todos', async () => {
    // Es lo que evita que un solo abusador deje afuera al resto. Depende de
    // `trust proxy` en producción: sin eso, todas las peticiones llegarían con
    // la dirección del proxy y caerían en el mismo balde.
    for (let intento = 0; intento < 12; intento += 1) {
      await pedir('10.0.0.2').post('/api/v1/panel/acceso/ingresar').send({
        email: 'alguien@manly.ar',
        contrasenia: 'probando',
      });
    }

    const otro = await pedir('10.0.0.3').post('/api/v1/panel/acceso/ingresar').send({
      email: 'alguien@manly.ar',
      contrasenia: 'probando',
    });

    expect(otro.status).toBe(401);
  });

  it('deja pasar el uso normal del sitio', async () => {
    const respuestas = await Promise.all(
      Array.from({ length: 30 }, () => pedir('10.0.0.4').get('/api/v1/salud')),
    );

    expect(respuestas.map((respuesta) => respuesta.status)).toEqual(
      Array.from({ length: 30 }, () => 200),
    );
  });

  it('no limita el webhook de pagos', async () => {
    // Mercado Pago reintenta con insistencia y un 429 significa que una reserva
    // pagada no se confirma nunca. Lo que protege esta ruta es la firma.
    const codigos: number[] = [];

    for (let intento = 0; intento < 25; intento += 1) {
      const respuesta = await pedir('10.0.0.5')
        .post('/api/v1/webhooks/mercado-pago')
        .send({ type: 'payment', data: { id: '1' } });

      codigos.push(respuesta.status);
    }

    // Un cuerpo sin firma válida se rechaza con 401, que es lo correcto: lo que
    // importa es que ninguno sea 429.
    expect(new Set(codigos)).toEqual(new Set([401]));
  });
});

describe('identificadores de ruta', () => {
  it('responde 404 y no 500 a un identificador mal formado', async () => {
    // Sin la tubería, el texto llega hasta PostgreSQL, que lo rechaza por no
    // ser un uuid, y la API contesta 500 a lo que en realidad es una dirección
    // que no existe.
    // El del catálogo es público, así que contesta 404 derecho. El del panel
    // exige sesión, así que el guardián lo corta antes con 401: en los dos
    // casos lo que importa es que no sea 500.
    expect(
      (await pedir('10.0.1.1').get('/api/v1/sucursales/no-soy-un-uuid/servicios')).status,
    ).toBe(404);

    expect((await pedir('10.0.1.1').get('/api/v1/panel/reservas/no-soy-un-uuid')).status).toBe(401);
  });

  it('el 404 de un identificador imposible no se distingue del de uno ausente', async () => {
    // Si se distinguieran, se podría sondear qué identificadores existen.
    const imposible = await pedir('10.0.1.2').get('/api/v1/sucursales/cualquier-cosa/servicios');
    const inexistente = await pedir('10.0.1.2').get(
      '/api/v1/sucursales/00000000-0000-4000-8000-000000000000/servicios',
    );

    expect(imposible.status).toBe(404);
    expect(inexistente.status).toBe(404);
  });
});

describe('rutas protegidas', () => {
  it('el panel entero exige sesión', async () => {
    const rutas = [
      '/api/v1/panel/agenda',
      '/api/v1/panel/solicitudes',
      '/api/v1/panel/usuarios',
      '/api/v1/panel/auditoria',
      '/api/v1/panel/fallas',
      '/api/v1/panel/configuracion',
      '/api/v1/panel/sucursales',
      '/api/v1/panel/servicios',
      '/api/v1/panel/profesionales',
      '/api/v1/panel/horarios',
    ];

    for (const ruta of rutas) {
      const respuesta = await pedir('10.0.2.1').get(ruta);

      expect(respuesta.status, ruta).toBe(401);
    }
  });

  it('el sitio público sigue abierto', async () => {
    const respuesta = await pedir('10.0.2.2').get('/api/v1/salud');

    expect(respuesta.status).toBe(200);
  });
});
