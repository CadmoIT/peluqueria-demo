// Pruebas del estado del sistema y del interruptor de reservas.
//
// Las dos cosas que se verifican acá existen para el día del lanzamiento y para
// el día que algo salga mal, así que tienen que funcionar la primera vez que se
// usen: no hay una segunda oportunidad de descubrir que el tablero mentía.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  actualizarConfiguracion,
  asegurarConfiguracion,
  cargarDemostracion,
  CARPETA_MIGRACIONES,
  registrarLatido,
  SEPARADOR_SENTENCIAS,
  type BaseDatos,
} from '@manly/base-datos';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CatalogoServicio } from '../catalogo/catalogo.servicio';
import { NotificacionesServicio } from '../notificaciones/notificaciones.servicio';
import { ReservasServicio } from '../reservas/reservas.servicio';
import { DiagnosticoServicio } from './diagnostico.servicio';

function configuracionFalsa(valores: Record<string, string> = {}) {
  const base: Record<string, string> = {
    NEXT_PUBLIC_URL_PUBLICA: 'http://localhost:3000',
    NODE_ENV: 'test',
    ...valores,
  };

  return { get: (clave: string) => base[clave] };
}

interface Contexto {
  cerrar: () => Promise<void>;
  bd: BaseDatos;
  diagnostico: DiagnosticoServicio;
  catalogo: CatalogoServicio;
  reservas: ReservasServicio;
}

async function montar(entorno: Record<string, string> = {}): Promise<Contexto> {
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

  const falsa = configuracionFalsa(entorno) as never;

  return {
    cerrar: () => cliente.close(),
    bd,
    diagnostico: new DiagnosticoServicio(bd, falsa),
    catalogo: new CatalogoServicio(bd),
    reservas: new ReservasServicio(bd, new NotificacionesServicio(bd, falsa)),
  };
}

let contexto: Contexto;

afterEach(async () => {
  await contexto.cerrar();
});

/** Busca una señal por su clave. Falla claro si no está. */
function senal(
  diagnostico: { senales: { clave: string; estado: string; detalle: string }[] },
  clave: string,
) {
  const encontrada = diagnostico.senales.find((una) => una.clave === clave);

  if (!encontrada) {
    throw new Error(
      `No hay señal "${clave}". Hay: ${diagnostico.senales.map((s) => s.clave).join(', ')}`,
    );
  }

  return encontrada;
}

describe('estado del sistema', () => {
  beforeEach(async () => {
    contexto = await montar();
  });

  it('avisa que el worker nunca corrió', async () => {
    // Es el caso de un entorno recién desplegado en el que alguien se olvidó de
    // levantar el segundo servicio. Nada falla: las notificaciones se acumulan
    // en silencio hasta que un cliente reclama.
    const estado = await contexto.diagnostico.consultar();

    expect(senal(estado, 'worker').estado).toBe('mal');
    expect(senal(estado, 'worker').detalle).toMatch(/nunca corrió/);
  });

  it('se pone en verde cuando el worker reporta', async () => {
    await registrarLatido(contexto.bd, { canalWhatsapp: 'real', canalEmail: 'real' });

    const estado = await contexto.diagnostico.consultar();

    expect(senal(estado, 'worker').estado).toBe('bien');
    expect(senal(estado, 'whatsapp').estado).toBe('bien');
    expect(senal(estado, 'email').estado).toBe('bien');
  });

  it('marca los canales simulados, que es el fallo que no se ve', async () => {
    // El simulador registra los envíos como exitosos: sin esta señal, un
    // entorno mandando a la nada se ve igual que uno funcionando.
    await registrarLatido(contexto.bd, { canalWhatsapp: 'simulado', canalEmail: 'real' });

    const estado = await contexto.diagnostico.consultar();

    expect(senal(estado, 'whatsapp').detalle).toMatch(/SIMULADO/);
    expect(senal(estado, 'email').estado).toBe('bien');
  });

  it('avisa que la pasarela es simulada', async () => {
    const estado = await contexto.diagnostico.consultar();

    expect(senal(estado, 'pasarela').detalle).toMatch(/SIMULADA/);
  });

  it('el latido guarda sólo la última corrida', async () => {
    await registrarLatido(contexto.bd, { canalWhatsapp: 'simulado', canalEmail: 'simulado' });
    await registrarLatido(contexto.bd, { canalWhatsapp: 'real', canalEmail: 'real' });

    const estado = await contexto.diagnostico.consultar();

    expect(senal(estado, 'whatsapp').estado).toBe('bien');
  });
});

describe('estado del sistema en producción', () => {
  beforeEach(async () => {
    contexto = await montar({ NODE_ENV: 'production', MP_ACCESS_TOKEN: 'APP_USR-de-verdad' });
  });

  it('un canal simulado en producción es un fallo, no un aviso', async () => {
    await registrarLatido(contexto.bd, { canalWhatsapp: 'simulado', canalEmail: 'real' });

    const estado = await contexto.diagnostico.consultar();

    expect(estado.entorno).toBe('produccion');
    expect(senal(estado, 'whatsapp').estado).toBe('mal');
  });

  it('un token de prueba en producción se marca: no entra dinero', async () => {
    contexto.diagnostico = new DiagnosticoServicio(
      contexto.bd,
      configuracionFalsa({ NODE_ENV: 'production', MP_ACCESS_TOKEN: 'TEST-token' }) as never,
    );

    const estado = await contexto.diagnostico.consultar();

    expect(senal(estado, 'pasarela').estado).toBe('atencion');
    expect(senal(estado, 'pasarela').detalle).toMatch(/no entra dinero real/);
  });
});

describe('interruptor de reservas online', () => {
  beforeEach(async () => {
    contexto = await montar();
  });

  it('arranca abierto', async () => {
    const publica = await contexto.catalogo.configuracionPublica();

    expect(publica.reservasOnlineActivas).toBe(true);
  });

  it('cerrado, la API rechaza retener con el mensaje configurado', async () => {
    // La web también lo consulta para no dibujar el flujo, pero **lo que corta
    // de verdad es esto**: esconder el botón no impide llamar a la API.
    await actualizarConfiguracion(contexto.bd, {
      reservasOnlineActivas: false,
      mensajeReservasCerradas: 'Estamos mudando el sistema de turnos.',
    });

    await expect(
      contexto.reservas.retener({
        sucursalId: '00000000-0000-4000-8000-000000000000',
        bloques: [],
      }),
    ).rejects.toThrow('Estamos mudando el sistema de turnos.');
  });

  it('cerrado sin mensaje, dice algo igual', async () => {
    await actualizarConfiguracion(contexto.bd, { reservasOnlineActivas: false });

    const publica = await contexto.catalogo.configuracionPublica();

    expect(publica.reservasOnlineActivas).toBe(false);
    expect(publica.mensajeReservasCerradas).toBeNull();

    await expect(
      contexto.reservas.retener({
        sucursalId: '00000000-0000-4000-8000-000000000000',
        bloques: [],
      }),
    ).rejects.toThrow(/no estamos tomando turnos/i);
  });

  it('se comprueba antes que los bloques: cerrado no revela nada del catálogo', async () => {
    // Con bloques inválidos, un sistema abierto contestaría 400 con el detalle
    // de qué está mal. Cerrado tiene que cortar antes.
    await actualizarConfiguracion(contexto.bd, { reservasOnlineActivas: false });

    await expect(
      contexto.reservas.retener({
        sucursalId: '00000000-0000-4000-8000-000000000000',
        bloques: [
          {
            servicioId: '00000000-0000-4000-8000-000000000001',
            profesionalId: '00000000-0000-4000-8000-000000000002',
            orden: 0,
            comienzaEn: new Date(Date.now() + 86_400_000).toISOString(),
            terminaEn: new Date(Date.now() + 86_400_000 + 2_700_000).toISOString(),
          },
        ],
      }),
    ).rejects.toThrow(/no estamos tomando turnos/i);
  });
});
