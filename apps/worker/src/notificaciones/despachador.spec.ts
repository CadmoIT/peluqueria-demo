// Pruebas de la bandeja de salida.
//
// Cubre los cuatro casos que exige el plan: entrega, reintento, plantilla
// rechazada y canal alternativo. Corre contra PostgreSQL en proceso, porque lo
// que se prueba es el manejo del estado de la cola, no la lógica en memoria.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CARPETA_MIGRACIONES,
  encolarNotificacion,
  SEPARADOR_SENTENCIAS,
  type BaseDatos,
} from '@manly/base-datos';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CanalSimulado } from './canales/simulados';
import { despacharPendientes, type Canales } from './despachador';
import type { DatosMensaje } from './plantillas';

const WHATSAPP = '5491133334444';
const EMAIL = 'cliente@ejemplo.com';

interface Contexto {
  cerrar: () => Promise<void>;
  ejecutar: (sql: string, parametros?: unknown[]) => Promise<{ rows: Record<string, string>[] }>;
  bd: BaseDatos;
  canales: Canales;
  whatsapp: CanalSimulado;
  email: CanalSimulado;
  reservaId: string;
}

const DATOS: DatosMensaje = {
  clienteNombre: 'Nicolás',
  sucursalNombre: 'Las Cañitas',
  sucursalDireccion: 'Báez 300',
  comienzaEn: '2027-10-01T18:30:00.000Z',
  servicios: ['Corte'],
  urlGestion: 'https://manly.com.ar/mi-reserva/abc',
  horasMinimasCancelacion: 24,
};

async function montar(): Promise<Contexto> {
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

  const ejecutar = async (sql: string, parametros: unknown[] = []) =>
    cliente.query<Record<string, string>>(sql, parametros);

  const unaFila = async (sql: string, parametros: unknown[] = []): Promise<string> => {
    const id = (await ejecutar(sql, parametros)).rows[0]?.id;

    if (id === undefined) throw new Error(`Sin id: ${sql}`);

    return id;
  };

  const sucursalId = await unaFila(
    `INSERT INTO sucursales (nombre, barrio, direccion) VALUES ('Las Cañitas', 'Las Cañitas', 'Báez 300') RETURNING id`,
  );

  // Una reserva con los dos datos de contacto, para poder probar el respaldo.
  const reservaId = await unaFila(
    `INSERT INTO reservas (
       sucursal_id, estado, cliente_nombre, canal_contacto, contacto_whatsapp, contacto_email,
       comienza_en, termina_en, precio_total_centavos, hash_token_gestion, acepto_condiciones_en
     ) VALUES ($1, 'confirmada', 'Nicolás', 'whatsapp', $2, $3,
       '2027-10-01T18:30:00Z', '2027-10-01T19:30:00Z', 1500000, 'hash-1', now())
     RETURNING id`,
    [sucursalId, WHATSAPP, EMAIL],
  );

  const bd = drizzle(cliente as never) as unknown as BaseDatos;
  const whatsapp = new CanalSimulado('whatsapp');
  const email = new CanalSimulado('email');

  return {
    cerrar: () => cliente.close(),
    ejecutar,
    bd,
    canales: { whatsapp, email },
    whatsapp,
    email,
    reservaId,
  };
}

let contexto: Contexto;

beforeEach(async () => {
  contexto = await montar();
});

afterEach(async () => {
  await contexto.cerrar();
});

/** Encola una notificación lista para salir. */
async function encolar(
  canal: 'whatsapp' | 'email' = 'whatsapp',
  opciones: { tipo?: string; datos?: unknown; programadaPara?: Date } = {},
): Promise<string> {
  return encolarNotificacion(contexto.bd, {
    reservaId: contexto.reservaId,
    tipo: (opciones.tipo ?? 'confirmacion') as 'confirmacion',
    canal,
    destino: canal === 'whatsapp' ? WHATSAPP : EMAIL,
    plantilla: opciones.tipo ?? 'confirmacion',
    // Con `??` un null explícito volvería a los datos válidos, y las pruebas
    // de datos corruptos no probarían nada.
    datos: 'datos' in opciones ? opciones.datos : DATOS,
    programadaPara: opciones.programadaPara ?? new Date(),
  });
}

/** Estado e intentos de una notificación. */
async function estadoDe(id: string): Promise<{ estado: string; intentos: number; error: string }> {
  const fila = await contexto.ejecutar(
    `SELECT estado, intentos::text AS intentos, coalesce(ultimo_error, '') AS ultimo_error
     FROM notificaciones WHERE id = $1`,
    [id],
  );

  return {
    estado: fila.rows[0]?.estado ?? '',
    intentos: Number(fila.rows[0]?.intentos ?? 0),
    error: fila.rows[0]?.ultimo_error ?? '',
  };
}

describe('entrega', () => {
  it('envía lo pendiente y lo marca como enviado', async () => {
    const id = await encolar();

    const resumen = await despacharPendientes(contexto.bd, contexto.canales);

    expect(resumen.enviadas).toBe(1);
    expect((await estadoDe(id)).estado).toBe('enviada');
    expect(contexto.whatsapp.mensajesEnviados()).toHaveLength(1);
  });

  it('el mensaje llega al destino y con la plantilla correcta', async () => {
    await encolar();
    await despacharPendientes(contexto.bd, contexto.canales);

    const [enviado] = contexto.whatsapp.mensajesEnviados();

    expect(enviado?.destino).toBe(WHATSAPP);
    expect(enviado?.plantilla).toBe('manly_confirmacion_turno');
    expect(enviado?.texto).toContain('Nicolás');
  });

  it('no toca las que están programadas para más adelante', async () => {
    await encolar('whatsapp', { programadaPara: new Date(Date.now() + 3_600_000) });

    const resumen = await despacharPendientes(contexto.bd, contexto.canales);

    expect(resumen.enviadas).toBe(0);
    expect(contexto.whatsapp.mensajesEnviados()).toHaveLength(0);
  });

  it('no vuelve a mandar lo que ya se envió', async () => {
    await encolar();
    await despacharPendientes(contexto.bd, contexto.canales);
    await despacharPendientes(contexto.bd, contexto.canales);

    expect(contexto.whatsapp.mensajesEnviados()).toHaveLength(1);
  });

  it('respeta el canal de cada notificación', async () => {
    await encolar('email');
    await despacharPendientes(contexto.bd, contexto.canales);

    expect(contexto.email.mensajesEnviados()).toHaveLength(1);
    expect(contexto.whatsapp.mensajesEnviados()).toHaveLength(0);
  });
});

describe('reintentos', () => {
  it('un fallo pasajero deja la notificación para más tarde', async () => {
    contexto.whatsapp.hacerFallar(WHATSAPP, 'El proveedor está caído.', true);

    const id = await encolar();
    const resumen = await despacharPendientes(contexto.bd, contexto.canales);

    expect(resumen.reintentar).toBe(1);

    const estado = await estadoDe(id);
    expect(estado.estado).toBe('pendiente');
    expect(estado.intentos).toBe(1);
    expect(estado.error).toContain('caído');
  });

  it('el reintento espera antes de volver a probar', async () => {
    contexto.whatsapp.hacerFallar(WHATSAPP, 'Caída pasajera.', true);

    await encolar();
    await despacharPendientes(contexto.bd, contexto.canales);

    // Enseguida no vuelve a intentarlo: su momento todavía no llegó.
    const segunda = await despacharPendientes(contexto.bd, contexto.canales);

    expect(segunda.reintentar).toBe(0);
  });

  it('cuando el proveedor vuelve, el reintento entrega', async () => {
    contexto.whatsapp.hacerFallar(WHATSAPP, 'Caída pasajera.', true);

    const id = await encolar();
    await despacharPendientes(contexto.bd, contexto.canales);

    contexto.whatsapp.dejarDeFallar(WHATSAPP);

    // Se adelanta el momento del reintento en vez de esperar un minuto.
    await contexto.ejecutar(`UPDATE notificaciones SET programada_para = now() WHERE id = $1`, [
      id,
    ]);

    const resumen = await despacharPendientes(contexto.bd, contexto.canales);

    expect(resumen.enviadas).toBe(1);
    expect((await estadoDe(id)).estado).toBe('enviada');
  });

  it('a los tres intentos la da por perdida', async () => {
    contexto.whatsapp.hacerFallar(WHATSAPP, 'Sigue caído.', true);
    // Sin email cargado no hay respaldo: se ve el agotamiento puro.
    await contexto.ejecutar(`UPDATE reservas SET contacto_email = NULL WHERE id = $1`, [
      contexto.reservaId,
    ]);

    const id = await encolar();

    for (let intento = 0; intento < 3; intento += 1) {
      await contexto.ejecutar(`UPDATE notificaciones SET programada_para = now() WHERE id = $1`, [
        id,
      ]);
      await despacharPendientes(contexto.bd, contexto.canales);
    }

    const estado = await estadoDe(id);
    expect(estado.estado).toBe('fallida');
    expect(estado.intentos).toBe(3);
  });
});

describe('fallos definitivos', () => {
  it('un número que no existe no gasta reintentos', async () => {
    contexto.whatsapp.hacerFallar(WHATSAPP, 'WhatsApp 131026: el número no existe.', false);
    await contexto.ejecutar(`UPDATE reservas SET contacto_email = NULL WHERE id = $1`, [
      contexto.reservaId,
    ]);

    const id = await encolar();
    await despacharPendientes(contexto.bd, contexto.canales);

    // De una queda fallida: insistir sobre un número inexistente sólo retrasa
    // el aviso al local.
    expect((await estadoDe(id)).estado).toBe('fallida');
    expect((await estadoDe(id)).intentos).toBe(1);
  });

  it('una plantilla rechazada no se reintenta', async () => {
    contexto.whatsapp.hacerFallar(
      WHATSAPP,
      'WhatsApp 132001: la plantilla no está aprobada.',
      false,
    );
    await contexto.ejecutar(`UPDATE reservas SET contacto_email = NULL WHERE id = $1`, [
      contexto.reservaId,
    ]);

    const id = await encolar();
    await despacharPendientes(contexto.bd, contexto.canales);

    const estado = await estadoDe(id);
    expect(estado.estado).toBe('fallida');
    expect(estado.error).toContain('132001');
  });

  it('datos corruptos no se reintentan: es un error del sistema, no del proveedor', async () => {
    // El enum de la base ya impide un tipo inexistente, así que el caso real
    // es una fila con los datos del mensaje incompletos.
    const id = await encolar('whatsapp', { datos: null });

    const resumen = await despacharPendientes(contexto.bd, contexto.canales);

    expect(resumen.fallidas).toBe(1);
    expect((await estadoDe(id)).estado).toBe('fallida');
    // No se llegó a llamar al proveedor: el mensaje ni se armó.
    expect(contexto.whatsapp.mensajesEnviados()).toHaveLength(0);
  });
});

describe('canal de respaldo', () => {
  it('cuando WhatsApp se agota, prueba por email', async () => {
    contexto.whatsapp.hacerFallar(WHATSAPP, 'El número no existe.', false);

    const id = await encolar('whatsapp');
    const resumen = await despacharPendientes(contexto.bd, contexto.canales);

    expect(resumen.conRespaldo).toBe(1);
    expect((await estadoDe(id)).estado).toBe('fallida');

    // Quedó una nueva encolada por email, lista para la próxima corrida.
    const segunda = await despacharPendientes(contexto.bd, contexto.canales);

    expect(segunda.enviadas).toBe(1);
    expect(contexto.email.mensajesEnviados()).toHaveLength(1);
    expect(contexto.email.mensajesEnviados()[0]?.destino).toBe(EMAIL);
  });

  it('sin segundo dato de contacto no hay respaldo posible', async () => {
    contexto.whatsapp.hacerFallar(WHATSAPP, 'El número no existe.', false);
    await contexto.ejecutar(`UPDATE reservas SET contacto_email = NULL WHERE id = $1`, [
      contexto.reservaId,
    ]);

    await encolar('whatsapp');

    const resumen = await despacharPendientes(contexto.bd, contexto.canales);

    expect(resumen.conRespaldo).toBe(0);
    expect(resumen.fallidas).toBe(1);
  });

  it('si los dos canales fallan, no se reencolan el uno al otro para siempre', async () => {
    contexto.whatsapp.hacerFallar(WHATSAPP, 'El número no existe.', false);
    contexto.email.hacerFallar(EMAIL, 'La dirección rebota.', false);

    await encolar('whatsapp');

    // Varias corridas: si hubiera bucle, la cola nunca se vaciaría.
    for (let corrida = 0; corrida < 4; corrida += 1) {
      await despacharPendientes(contexto.bd, contexto.canales);
    }

    const pendientes = await contexto.ejecutar(
      `SELECT count(*)::text AS total FROM notificaciones WHERE estado = 'pendiente'`,
    );
    const total = await contexto.ejecutar(`SELECT count(*)::text AS total FROM notificaciones`);

    expect(Number(pendientes.rows[0]?.total ?? -1)).toBe(0);
    // Exactamente dos: la original y su respaldo. Ni una más.
    expect(Number(total.rows[0]?.total ?? -1)).toBe(2);
  });

  it('el respaldo lleva el mismo contenido que el original', async () => {
    contexto.whatsapp.hacerFallar(WHATSAPP, 'El número no existe.', false);

    await encolar('whatsapp');
    await despacharPendientes(contexto.bd, contexto.canales);
    await despacharPendientes(contexto.bd, contexto.canales);

    const [porEmail] = contexto.email.mensajesEnviados();

    expect(porEmail?.texto).toContain('Nicolás');
    expect(porEmail?.texto).toContain(DATOS.urlGestion);
  });
});
