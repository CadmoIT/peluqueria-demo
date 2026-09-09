// Prueba de integración de la búsqueda de disponibilidad.
//
// Atraviesa el vertical completo: las consultas SQL del repositorio, la
// conversión de horario local y el motor de itinerarios, contra un PostgreSQL
// real levantado en proceso con PGlite y con las mismas migraciones que
// producción.
//
// Las pruebas de `dominio/` cubren la lógica con datos armados a mano; esta
// verifica que lo que sale de la base sea lo que el motor espera recibir.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CARPETA_MIGRACIONES, SEPARADOR_SENTENCIAS, type BaseDatos } from '@manly/base-datos';

import { DisponibilidadServicio } from './disponibilidad.servicio';

// Jueves 1 de octubre de 2026. Se fija la fecha porque el servicio nunca
// ofrece horarios en el pasado, y una fecha relativa haría la prueba frágil.
const JUEVES = '2026-10-01';

interface Contexto {
  cerrar: () => Promise<void>;
  ejecutar: (sql: string, parametros?: unknown[]) => Promise<{ rows: Record<string, string>[] }>;
  servicio: DisponibilidadServicio;
  ids: {
    sucursalId: string;
    corteId: string;
    barbaId: string;
    anaId: string;
    betoId: string;
  };
}

async function montar(): Promise<Contexto> {
  // PGlite es ESM y este paquete compila a CommonJS: carga dinámica.
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
    const resultado = await ejecutar(sql, parametros);
    const id = resultado.rows[0]?.id;

    if (id === undefined) {
      throw new Error(`La sentencia no devolvió ningún id: ${sql}`);
    }

    return id;
  };

  await ejecutar(`INSERT INTO configuracion_negocio DEFAULT VALUES`);

  const sucursalId = await unaFila(
    `INSERT INTO sucursales (nombre, barrio, direccion) VALUES ('Las Cañitas', 'Las Cañitas', 'Calle 1') RETURNING id`,
  );

  const corteId = await unaFila(
    `INSERT INTO servicios (nombre, duracion_minutos, precio_centavos) VALUES ('Corte', 60, 1500000) RETURNING id`,
  );

  const barbaId = await unaFila(
    `INSERT INTO servicios (nombre, duracion_minutos, precio_centavos, modalidad_senia, senia_porcentaje)
     VALUES ('Barba', 30, 900000, 'porcentual', 30) RETURNING id`,
  );

  const anaId = await unaFila(`INSERT INTO profesionales (nombre) VALUES ('Ana') RETURNING id`);
  const betoId = await unaFila(`INSERT INTO profesionales (nombre) VALUES ('Beto') RETURNING id`);

  await ejecutar(
    `INSERT INTO servicios_sucursales (servicio_id, sucursal_id) VALUES ($1, $3), ($2, $3)`,
    [corteId, barbaId, sucursalId],
  );

  await ejecutar(
    `INSERT INTO profesionales_sucursales (profesional_id, sucursal_id) VALUES ($1, $3), ($2, $3)`,
    [anaId, betoId, sucursalId],
  );

  await ejecutar(
    `INSERT INTO profesionales_servicios (profesional_id, servicio_id)
     VALUES ($1, $3), ($1, $4), ($2, $3), ($2, $4)`,
    [anaId, betoId, corteId, barbaId],
  );

  // Jueves (día 4) de 10 a 20, hora de Buenos Aires.
  await ejecutar(
    `INSERT INTO horarios_semanales (profesional_id, sucursal_id, dia_semana, comienza, termina)
     VALUES ($1, $3, 4, '10:00', '20:00'), ($2, $3, 4, '10:00', '20:00')`,
    [anaId, betoId, sucursalId],
  );

  // El mismo objeto en runtime, pero TypeScript ve dos tipos distintos según
  // se resuelva PGlite en modo require o import, porque tiene campos privados.
  const bd = drizzle(cliente as never) as unknown as BaseDatos;

  return {
    cerrar: () => cliente.close(),
    ejecutar,
    servicio: new DisponibilidadServicio(bd),
    ids: { sucursalId, corteId, barbaId, anaId, betoId },
  };
}

let contexto: Contexto;

beforeEach(async () => {
  contexto = await montar();
});

afterEach(async () => {
  await contexto.cerrar();
});

/** Ventana de búsqueda que cubre el jueves entero. */
function ventana() {
  return {
    desde: `${JUEVES}T00:00:00.000Z`,
    hasta: `${JUEVES}T23:59:00.000Z`,
  };
}

function hora(iso: string): string {
  return iso.slice(11, 16);
}

describe('búsqueda de disponibilidad de punta a punta', () => {
  it('ofrece horarios dentro del horario de trabajo cargado en la base', async () => {
    const { opciones } = await contexto.servicio.buscar({
      sucursalId: contexto.ids.sucursalId,
      servicios: [{ servicioId: contexto.ids.corteId, profesionalId: null }],
      ...ventana(),
    });

    expect(opciones.length).toBeGreaterThan(0);

    // 10 a 20 hora de Buenos Aires son las 13 a 23 UTC.
    expect(hora(opciones[0]!.comienzaEn)).toBe('13:00');
    expect(hora(opciones[opciones.length - 1]!.terminaEn)).toBe('23:00');
  });

  it('calcula la seña porcentual configurada en el servicio', async () => {
    const { opciones } = await contexto.servicio.buscar({
      sucursalId: contexto.ids.sucursalId,
      servicios: [{ servicioId: contexto.ids.barbaId, profesionalId: null }],
      ...ventana(),
    });

    // 30% de 900000 centavos.
    expect(opciones[0]!.seniaTotalCentavos).toBe(270_000);
    expect(opciones[0]!.precioTotalCentavos).toBe(900_000);
  });

  it('encadena dos servicios sin tiempos muertos y suma los precios', async () => {
    const { opciones } = await contexto.servicio.buscar({
      sucursalId: contexto.ids.sucursalId,
      servicios: [
        { servicioId: contexto.ids.corteId, profesionalId: null },
        { servicioId: contexto.ids.barbaId, profesionalId: null },
      ],
      ...ventana(),
    });

    const primera = opciones[0]!;

    expect(primera.bloques).toHaveLength(2);
    expect(primera.bloques[1]!.comienzaEn).toBe(primera.bloques[0]!.terminaEn);
    expect(primera.duracionTotalMinutos).toBe(90);
    expect(primera.precioTotalCentavos).toBe(2_400_000);
  });

  it('devuelve el nombre del profesional asignado', async () => {
    const { opciones } = await contexto.servicio.buscar({
      sucursalId: contexto.ids.sucursalId,
      servicios: [{ servicioId: contexto.ids.corteId, profesionalId: contexto.ids.betoId }],
      ...ventana(),
    });

    expect(opciones[0]!.bloques[0]!.profesionalNombre).toBe('Beto');
    expect(opciones[0]!.bloques[0]!.profesionalId).toBe(contexto.ids.betoId);
  });

  it('deja de ofrecer un horario cuando ya hay una reserva confirmada', async () => {
    const pedido = {
      sucursalId: contexto.ids.sucursalId,
      servicios: [{ servicioId: contexto.ids.corteId, profesionalId: contexto.ids.anaId }],
      ...ventana(),
    };

    const antes = await contexto.servicio.buscar(pedido);
    expect(antes.opciones.some((opcion) => hora(opcion.comienzaEn) === '15:00')).toBe(true);

    const reserva = await contexto.ejecutar(
      `INSERT INTO reservas (
         sucursal_id, estado, cliente_nombre, canal_contacto, contacto_whatsapp,
         comienza_en, termina_en, precio_total_centavos, hash_token_gestion, acepto_condiciones_en
       ) VALUES ($1, 'confirmada', 'Cliente', 'whatsapp', '5491100000000',
         '${JUEVES}T15:00:00Z', '${JUEVES}T16:00:00Z', 1500000, 'hash-1', now())
       RETURNING id`,
      [contexto.ids.sucursalId],
    );

    await contexto.ejecutar(
      `INSERT INTO reservas_servicios (
         reserva_id, servicio_id, profesional_id, orden, comienza_en, termina_en,
         ocupa_desde, ocupa_hasta, servicio_nombre, duracion_minutos, precio_centavos
       ) VALUES ($1, $2, $3, 0, '${JUEVES}T15:00:00Z', '${JUEVES}T16:00:00Z',
         '${JUEVES}T15:00:00Z', '${JUEVES}T16:00:00Z', 'Corte', 60, 1500000)`,
      [reserva.rows[0]!.id, contexto.ids.corteId, contexto.ids.anaId],
    );

    const despues = await contexto.servicio.buscar(pedido);

    expect(despues.opciones.some((opcion) => hora(opcion.comienzaEn) === '15:00')).toBe(false);
    // El horario que arranca justo al terminar la reserva sigue disponible.
    expect(despues.opciones.some((opcion) => hora(opcion.comienzaEn) === '16:00')).toBe(true);
  });

  it('una retención vencida no bloquea el horario aunque siga pendiente', async () => {
    const pedido = {
      sucursalId: contexto.ids.sucursalId,
      servicios: [{ servicioId: contexto.ids.corteId, profesionalId: contexto.ids.anaId }],
      ...ventana(),
    };

    const reserva = await contexto.ejecutar(
      `INSERT INTO reservas (
         sucursal_id, estado, comienza_en, termina_en, precio_total_centavos,
         hash_token_gestion, retencion_expira_en
       ) VALUES ($1, 'pendiente_pago', '${JUEVES}T15:00:00Z', '${JUEVES}T16:00:00Z',
         1500000, 'hash-2', now() - interval '1 minute')
       RETURNING id`,
      [contexto.ids.sucursalId],
    );

    await contexto.ejecutar(
      `INSERT INTO reservas_servicios (
         reserva_id, servicio_id, profesional_id, orden, comienza_en, termina_en,
         ocupa_desde, ocupa_hasta, servicio_nombre, duracion_minutos, precio_centavos
       ) VALUES ($1, $2, $3, 0, '${JUEVES}T15:00:00Z', '${JUEVES}T16:00:00Z',
         '${JUEVES}T15:00:00Z', '${JUEVES}T16:00:00Z', 'Corte', 60, 1500000)`,
      [reserva.rows[0]!.id, contexto.ids.corteId, contexto.ids.anaId],
    );

    const { opciones } = await contexto.servicio.buscar(pedido);

    // El worker todavía no la expiró, pero el motor ya no la cuenta.
    expect(opciones.some((opcion) => hora(opcion.comienzaEn) === '15:00')).toBe(true);
  });

  it('un feriado de la sucursal deja el día sin horarios', async () => {
    await contexto.ejecutar(
      `INSERT INTO excepciones_horario (sucursal_id, tipo, comienza_en, termina_en)
       VALUES ($1, 'feriado', '${JUEVES}T00:00:00Z', '${JUEVES}T23:59:00Z')`,
      [contexto.ids.sucursalId],
    );

    const { opciones } = await contexto.servicio.buscar({
      sucursalId: contexto.ids.sucursalId,
      servicios: [{ servicioId: contexto.ids.corteId, profesionalId: null }],
      ...ventana(),
    });

    expect(opciones).toEqual([]);
  });

  it('un servicio inactivo se rechaza como pedido inválido', async () => {
    await contexto.ejecutar(`UPDATE servicios SET activo = false WHERE id = $1`, [
      contexto.ids.corteId,
    ]);

    await expect(
      contexto.servicio.buscar({
        sucursalId: contexto.ids.sucursalId,
        servicios: [{ servicioId: contexto.ids.corteId, profesionalId: null }],
        ...ventana(),
      }),
    ).rejects.toThrow(/no existe o no se presta/);
  });

  it('un profesional inactivo deja de ofrecerse', async () => {
    await contexto.ejecutar(`UPDATE profesionales SET activo = false WHERE id = $1`, [
      contexto.ids.anaId,
    ]);

    const { opciones } = await contexto.servicio.buscar({
      sucursalId: contexto.ids.sucursalId,
      servicios: [{ servicioId: contexto.ids.corteId, profesionalId: null }],
      ...ventana(),
    });

    expect(opciones.length).toBeGreaterThan(0);
    expect(
      opciones.every((opcion) => opcion.bloques[0]!.profesionalId === contexto.ids.betoId),
    ).toBe(true);
  });
});
