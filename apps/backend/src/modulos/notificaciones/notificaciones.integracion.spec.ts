// Prueba de integración del encolado de notificaciones.
//
// Verifica que los avisos se preparen en los momentos correctos del flujo de
// reserva. El envío en sí lo prueba el worker; acá importa **cuándo** se encola
// y en qué estado, que es donde está la sutileza:
//
// Los avisos se arman siempre al completar los datos, porque ese es el único
// momento en el que se tiene el token del enlace en claro. Si falta pagar la
// seña quedan retenidos y los libera el pago.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CARPETA_MIGRACIONES, SEPARADOR_SENTENCIAS, type BaseDatos } from '@manly/base-datos';
import type { BloqueElegido } from '@manly/contratos';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DisponibilidadServicio } from '../disponibilidad/disponibilidad.servicio';
import { PagosServicio } from '../pagos/pagos.servicio';
import { SimuladaPasarela } from '../pagos/pasarela/simulada.pasarela';
import { ReservasServicio } from '../reservas/reservas.servicio';
import { NotificacionesServicio } from './notificaciones.servicio';

function proximoJueves(): string {
  const fecha = new Date(Date.now() + 30 * 24 * 3_600_000);

  while (fecha.getUTCDay() !== 4) {
    fecha.setUTCDate(fecha.getUTCDate() + 1);
  }

  return fecha.toISOString().slice(0, 10);
}

const JUEVES = proximoJueves();

function configuracionFalsa() {
  const valores: Record<string, string> = {
    NEXT_PUBLIC_URL_PUBLICA: 'http://localhost:3000',
    URL_PUBLICA_API: 'http://localhost:3001/api/v1',
    MP_SECRETO_WEBHOOK: 'secreto',
  };

  return { get: (clave: string) => valores[clave] };
}

interface Contexto {
  cerrar: () => Promise<void>;
  ejecutar: (sql: string, parametros?: unknown[]) => Promise<{ rows: Record<string, string>[] }>;
  disponibilidad: DisponibilidadServicio;
  reservas: ReservasServicio;
  pagos: PagosServicio;
  pasarela: SimuladaPasarela;
  ids: { sucursalId: string; sinSeniaId: string; conSeniaId: string; anaId: string };
}

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

  // Recordatorios a 24 y 2 horas, que son los valores por defecto del plan.
  await ejecutar(`INSERT INTO configuracion_negocio DEFAULT VALUES`);

  const sucursalId = await unaFila(
    `INSERT INTO sucursales (nombre, barrio, direccion) VALUES ('Las Cañitas', 'Las Cañitas', 'Báez 300') RETURNING id`,
  );
  const sinSeniaId = await unaFila(
    `INSERT INTO servicios (nombre, duracion_minutos, precio_centavos) VALUES ('Corte', 60, 1500000) RETURNING id`,
  );
  const conSeniaId = await unaFila(
    `INSERT INTO servicios (nombre, duracion_minutos, precio_centavos, modalidad_senia, senia_porcentaje)
     VALUES ('Color', 60, 4000000, 'porcentual', 30) RETURNING id`,
  );
  const anaId = await unaFila(`INSERT INTO profesionales (nombre) VALUES ('Ana') RETURNING id`);

  await ejecutar(
    `INSERT INTO servicios_sucursales (servicio_id, sucursal_id) VALUES ($1, $3), ($2, $3)`,
    [sinSeniaId, conSeniaId, sucursalId],
  );
  await ejecutar(
    `INSERT INTO profesionales_sucursales (profesional_id, sucursal_id) VALUES ($1, $2)`,
    [anaId, sucursalId],
  );
  await ejecutar(
    `INSERT INTO profesionales_servicios (profesional_id, servicio_id) VALUES ($1, $2), ($1, $3)`,
    [anaId, sinSeniaId, conSeniaId],
  );
  await ejecutar(
    `INSERT INTO horarios_semanales (profesional_id, sucursal_id, dia_semana, comienza, termina)
     VALUES ($1, $2, 4, '10:00', '20:00')`,
    [anaId, sucursalId],
  );

  const bd = drizzle(cliente as never) as unknown as BaseDatos;
  const notificaciones = new NotificacionesServicio(bd, configuracionFalsa() as never);
  const pasarela = new SimuladaPasarela('http://localhost:3001/api/v1');

  return {
    cerrar: () => cliente.close(),
    ejecutar,
    disponibilidad: new DisponibilidadServicio(bd),
    reservas: new ReservasServicio(bd, notificaciones),
    pagos: new PagosServicio(bd, pasarela, configuracionFalsa() as never, notificaciones),
    pasarela,
    ids: { sucursalId, sinSeniaId, conSeniaId, anaId },
  };
}

let contexto: Contexto;

beforeEach(async () => {
  contexto = await montar();
});

afterEach(async () => {
  await contexto.cerrar();
});

const CLIENTE = {
  nombre: 'Nicolás',
  canalContacto: 'whatsapp' as const,
  whatsapp: '5491133334444',
  aceptaCondiciones: true as const,
};

/** Reserva un servicio y devuelve el token. */
async function reservar(servicioId: string, cliente = CLIENTE): Promise<string> {
  const { opciones } = await contexto.disponibilidad.buscar({
    sucursalId: contexto.ids.sucursalId,
    servicios: [{ servicioId, profesionalId: null }],
    desde: `${JUEVES}T00:00:00.000Z`,
    hasta: `${JUEVES}T23:59:00.000Z`,
  });

  const bloques: BloqueElegido[] = opciones[0]!.bloques.map((bloque) => ({
    servicioId: bloque.servicioId,
    profesionalId: bloque.profesionalId,
    orden: bloque.orden,
    comienzaEn: bloque.comienzaEn,
    terminaEn: bloque.terminaEn,
  }));

  const retencion = await contexto.reservas.retener({
    sucursalId: contexto.ids.sucursalId,
    bloques,
  });

  await contexto.reservas.confirmar({ token: retencion.token, cliente });

  return retencion.token;
}

/** Las notificaciones de la cola, con su tipo, estado y canal. */
async function cola(): Promise<{ tipo: string; estado: string; canal: string }[]> {
  const filas = await contexto.ejecutar(
    `SELECT tipo, estado, canal FROM notificaciones ORDER BY programada_para`,
  );

  return filas.rows.map((fila) => ({
    tipo: fila.tipo ?? '',
    estado: fila.estado ?? '',
    canal: fila.canal ?? '',
  }));
}

describe('reserva sin seña', () => {
  it('encola la confirmación lista para salir', async () => {
    await reservar(contexto.ids.sinSeniaId);

    const pendientes = await cola();

    expect(pendientes).toContainEqual({
      tipo: 'confirmacion',
      estado: 'pendiente',
      canal: 'whatsapp',
    });
  });

  it('programa los dos recordatorios del plan', async () => {
    await reservar(contexto.ids.sinSeniaId);

    const tipos = (await cola()).map((fila) => fila.tipo);

    expect(tipos).toContain('recordatorio_primero');
    expect(tipos).toContain('recordatorio_segundo');
  });

  it('los recordatorios quedan programados antes del turno', async () => {
    await reservar(contexto.ids.sinSeniaId);

    const filas = await contexto.ejecutar(
      `SELECT n.tipo,
              extract(epoch from (r.comienza_en - n.programada_para))::text AS anticipacion
       FROM notificaciones n JOIN reservas r ON r.id = n.reserva_id
       WHERE n.tipo::text LIKE 'recordatorio%' ORDER BY n.tipo`,
    );

    const horas = Object.fromEntries(
      filas.rows.map((fila) => [fila.tipo, Math.round(Number(fila.anticipacion) / 3600)]),
    );

    expect(horas.recordatorio_primero).toBe(24);
    expect(horas.recordatorio_segundo).toBe(2);
  });

  it('el aviso lleva el enlace de gestión con el token en claro', async () => {
    const token = await reservar(contexto.ids.sinSeniaId);

    const fila = await contexto.ejecutar(
      `SELECT datos->>'urlGestion' AS url FROM notificaciones WHERE tipo = 'confirmacion'`,
    );

    expect(fila.rows[0]?.url).toContain(token);
  });

  it('usa el canal que la persona eligió', async () => {
    await reservar(contexto.ids.sinSeniaId, {
      ...CLIENTE,
      canalContacto: 'email' as const,
      whatsapp: undefined,
      email: 'cliente@ejemplo.com',
    } as never);

    const confirmacion = (await cola()).find((fila) => fila.tipo === 'confirmacion');

    expect(confirmacion?.canal).toBe('email');
  });
});

describe('reserva con seña', () => {
  it('deja los avisos retenidos hasta que se pague', async () => {
    await reservar(contexto.ids.conSeniaId);

    const pendientes = await cola();

    expect(pendientes.length).toBeGreaterThan(0);
    expect(pendientes.every((fila) => fila.estado === 'retenida')).toBe(true);
  });

  it('al acreditarse el pago los libera', async () => {
    const token = await reservar(contexto.ids.conSeniaId);

    const preferencia = await contexto.pagos.crearPreferencia(token);
    const pago = contexto.pasarela.resolverPago(preferencia.preferenciaId, 'aprobado')!;
    await contexto.pagos.procesarNotificacion(pago.id);

    const confirmacion = (await cola()).find((fila) => fila.tipo === 'confirmacion');

    expect(confirmacion?.estado).toBe('pendiente');
  });

  it('si el pago se rechaza, los avisos siguen retenidos', async () => {
    const token = await reservar(contexto.ids.conSeniaId);

    const preferencia = await contexto.pagos.crearPreferencia(token);
    const pago = contexto.pasarela.resolverPago(preferencia.preferenciaId, 'rechazado')!;
    await contexto.pagos.procesarNotificacion(pago.id);

    const confirmacion = (await cola()).find((fila) => fila.tipo === 'confirmacion');

    expect(confirmacion?.estado).toBe('retenida');
  });
});

describe('cancelación', () => {
  it('avisa y descarta los recordatorios que ya no aplican', async () => {
    const token = await reservar(contexto.ids.sinSeniaId);

    await contexto.reservas.cancelar(token, null);

    const pendientes = await cola();
    const recordatorios = pendientes.filter((fila) => fila.tipo.startsWith('recordatorio'));

    expect(pendientes.some((fila) => fila.tipo === 'cancelacion')).toBe(true);
    // Mandar el recordatorio de un turno cancelado es peor que no mandar nada.
    expect(recordatorios.every((fila) => fila.estado === 'descartada')).toBe(true);
  });
});

describe('reprogramación', () => {
  it('avisa el horario nuevo y reprograma los recordatorios', async () => {
    const token = await reservar(contexto.ids.sinSeniaId);

    const { opciones } = await contexto.disponibilidad.buscar({
      sucursalId: contexto.ids.sucursalId,
      servicios: [{ servicioId: contexto.ids.sinSeniaId, profesionalId: null }],
      desde: `${JUEVES}T00:00:00.000Z`,
      hasta: `${JUEVES}T23:59:00.000Z`,
    });

    const reserva = await contexto.reservas.consultar(token);
    const nueva = opciones.find((opcion) => opcion.comienzaEn !== reserva.comienzaEn)!;

    await contexto.reservas.reprogramar(token, {
      sucursalId: contexto.ids.sucursalId,
      bloques: nueva.bloques.map((bloque) => ({
        servicioId: bloque.servicioId,
        profesionalId: bloque.profesionalId,
        orden: bloque.orden,
        comienzaEn: bloque.comienzaEn,
        terminaEn: bloque.terminaEn,
      })),
    });

    const pendientes = await cola();

    expect(pendientes.some((fila) => fila.tipo === 'reprogramacion')).toBe(true);

    // Los viejos quedaron descartados y hay recordatorios nuevos vigentes.
    const recordatorios = pendientes.filter((fila) => fila.tipo.startsWith('recordatorio'));
    expect(recordatorios.some((fila) => fila.estado === 'descartada')).toBe(true);
    expect(recordatorios.some((fila) => fila.estado === 'pendiente')).toBe(true);
  });
});
