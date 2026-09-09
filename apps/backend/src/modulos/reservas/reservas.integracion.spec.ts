// Prueba de integración del flujo de reserva completo.
//
// Recorre lo que hace una persona: buscar, retener, completar, consultar el
// enlace privado y cancelar. Y también lo que haría alguien manipulando el
// pedido, que es la razón de que el servidor revalide todo en vez de confiar en
// lo que le mandan.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CARPETA_MIGRACIONES, SEPARADOR_SENTENCIAS, type BaseDatos } from '@manly/base-datos';
import type { BloqueElegido } from '@manly/contratos';

import { DisponibilidadServicio } from '../disponibilidad/disponibilidad.servicio';
import { ReservasServicio } from './reservas.servicio';

interface Contexto {
  cerrar: () => Promise<void>;
  ejecutar: (sql: string, parametros?: unknown[]) => Promise<{ rows: Record<string, string>[] }>;
  disponibilidad: DisponibilidadServicio;
  reservas: ReservasServicio;
  ids: { sucursalId: string; corteId: string; conSeniaId: string; anaId: string; betoId: string };
}

/** Un jueves lo bastante lejos como para que nunca quede en el pasado. */
function proximoJueves(): string {
  const fecha = new Date(Date.now() + 30 * 24 * 3_600_000);

  while (fecha.getUTCDay() !== 4) {
    fecha.setUTCDate(fecha.getUTCDate() + 1);
  }

  return fecha.toISOString().slice(0, 10);
}

const JUEVES = proximoJueves();

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

  await ejecutar(`INSERT INTO configuracion_negocio DEFAULT VALUES`);

  const sucursalId = await unaFila(
    `INSERT INTO sucursales (nombre, barrio, direccion) VALUES ('Las Cañitas', 'Las Cañitas', 'Calle 1') RETURNING id`,
  );
  const corteId = await unaFila(
    `INSERT INTO servicios (nombre, duracion_minutos, precio_centavos) VALUES ('Corte', 60, 1500000) RETURNING id`,
  );
  const conSeniaId = await unaFila(
    `INSERT INTO servicios (nombre, duracion_minutos, precio_centavos, modalidad_senia, senia_porcentaje)
     VALUES ('Color', 60, 4000000, 'porcentual', 30) RETURNING id`,
  );
  const anaId = await unaFila(`INSERT INTO profesionales (nombre) VALUES ('Ana') RETURNING id`);
  const betoId = await unaFila(`INSERT INTO profesionales (nombre) VALUES ('Beto') RETURNING id`);

  await ejecutar(
    `INSERT INTO servicios_sucursales (servicio_id, sucursal_id) VALUES ($1, $3), ($2, $3)`,
    [corteId, conSeniaId, sucursalId],
  );
  await ejecutar(
    `INSERT INTO profesionales_sucursales (profesional_id, sucursal_id) VALUES ($1, $3), ($2, $3)`,
    [anaId, betoId, sucursalId],
  );
  // Beto no presta el servicio con seña: sirve para probar la validación.
  await ejecutar(
    `INSERT INTO profesionales_servicios (profesional_id, servicio_id)
     VALUES ($1, $3), ($1, $4), ($2, $3)`,
    [anaId, betoId, corteId, conSeniaId],
  );
  await ejecutar(
    `INSERT INTO horarios_semanales (profesional_id, sucursal_id, dia_semana, comienza, termina)
     VALUES ($1, $3, 4, '10:00', '20:00'), ($2, $3, 4, '10:00', '20:00')`,
    [anaId, betoId, sucursalId],
  );

  const bd = drizzle(cliente as never) as unknown as BaseDatos;

  return {
    cerrar: () => cliente.close(),
    ejecutar,
    disponibilidad: new DisponibilidadServicio(bd),
    reservas: new ReservasServicio(bd),
    ids: { sucursalId, corteId, conSeniaId, anaId, betoId },
  };
}

let contexto: Contexto;

beforeEach(async () => {
  contexto = await montar();
});

afterEach(async () => {
  await contexto.cerrar();
});

/** Toma la primera opción real que devuelve la búsqueda. */
async function primeraOpcion(servicioId: string, profesionalId: string | null = null) {
  const { opciones } = await contexto.disponibilidad.buscar({
    sucursalId: contexto.ids.sucursalId,
    servicios: [{ servicioId, profesionalId }],
    desde: `${JUEVES}T00:00:00.000Z`,
    hasta: `${JUEVES}T23:59:00.000Z`,
  });

  const opcion = opciones[0];

  if (!opcion) throw new Error('La búsqueda no devolvió opciones.');

  return opcion;
}

function aBloques(opcion: Awaited<ReturnType<typeof primeraOpcion>>): BloqueElegido[] {
  return opcion.bloques.map((bloque) => ({
    servicioId: bloque.servicioId,
    profesionalId: bloque.profesionalId,
    orden: bloque.orden,
    comienzaEn: bloque.comienzaEn,
    terminaEn: bloque.terminaEn,
  }));
}

const CLIENTE = {
  nombre: 'Nicolás',
  canalContacto: 'whatsapp' as const,
  whatsapp: '5491133334444',
  aceptaCondiciones: true as const,
};

describe('flujo de reserva', () => {
  it('busca, retiene y completa una reserva sin seña', async () => {
    const opcion = await primeraOpcion(contexto.ids.corteId);

    const retencion = await contexto.reservas.retener({
      sucursalId: contexto.ids.sucursalId,
      bloques: aBloques(opcion),
    });

    expect(retencion.token).toHaveLength(43);
    expect(retencion.seniaTotalCentavos).toBe(0);
    expect(new Date(retencion.retencionExpiraEn).getTime()).toBeGreaterThan(Date.now());

    const reserva = await contexto.reservas.confirmar({
      token: retencion.token,
      cliente: CLIENTE,
    });

    // Sin seña no hay nada que esperar: queda confirmada de una.
    expect(reserva.estado).toBe('confirmada');
    expect(reserva.clienteNombre).toBe('Nicolás');
    expect(reserva.bloques[0]!.profesionalNombre).toMatch(/Ana|Beto/);
  });

  it('deja pendiente de pago la reserva que lleva seña', async () => {
    const opcion = await primeraOpcion(contexto.ids.conSeniaId);
    const retencion = await contexto.reservas.retener({
      sucursalId: contexto.ids.sucursalId,
      bloques: aBloques(opcion),
    });

    expect(retencion.seniaTotalCentavos).toBe(1_200_000);

    const reserva = await contexto.reservas.confirmar({
      token: retencion.token,
      cliente: CLIENTE,
    });

    expect(reserva.estado).toBe('pendiente_pago');
  });

  it('guarda sólo el hash del token, nunca el token en claro', async () => {
    const opcion = await primeraOpcion(contexto.ids.corteId);
    const retencion = await contexto.reservas.retener({
      sucursalId: contexto.ids.sucursalId,
      bloques: aBloques(opcion),
    });

    const fila = await contexto.ejecutar(`SELECT hash_token_gestion FROM reservas WHERE id = $1`, [
      retencion.reservaId,
    ]);

    const guardado = fila.rows[0]!.hash_token_gestion;

    expect(guardado).not.toBe(retencion.token);
    expect(guardado).toMatch(/^[0-9a-f]{64}$/);
  });

  it('el horario retenido deja de ofrecerse a otra persona', async () => {
    const opcion = await primeraOpcion(contexto.ids.corteId, contexto.ids.anaId);

    await contexto.reservas.retener({
      sucursalId: contexto.ids.sucursalId,
      bloques: aBloques(opcion),
    });

    const { opciones } = await contexto.disponibilidad.buscar({
      sucursalId: contexto.ids.sucursalId,
      servicios: [{ servicioId: contexto.ids.corteId, profesionalId: contexto.ids.anaId }],
      desde: `${JUEVES}T00:00:00.000Z`,
      hasta: `${JUEVES}T23:59:00.000Z`,
    });

    expect(opciones.some((otra) => otra.comienzaEn === opcion.comienzaEn)).toBe(false);
  });

  it('rechaza retener dos veces el mismo horario', async () => {
    const opcion = await primeraOpcion(contexto.ids.corteId, contexto.ids.anaId);
    const bloques = aBloques(opcion);

    await contexto.reservas.retener({ sucursalId: contexto.ids.sucursalId, bloques });

    await expect(
      contexto.reservas.retener({ sucursalId: contexto.ids.sucursalId, bloques }),
    ).rejects.toThrow(/ya fue tomado/);
  });
});

describe('el servidor no confía en el pedido', () => {
  it('ignora el precio y la duración que mande el cliente', async () => {
    const opcion = await primeraOpcion(contexto.ids.conSeniaId);
    const bloques = aBloques(opcion);

    const retencion = await contexto.reservas.retener({
      sucursalId: contexto.ids.sucursalId,
      // El cuerpo ni siquiera acepta precio: se recalcula siempre desde la base.
      bloques,
    });

    expect(retencion.precioTotalCentavos).toBe(4_000_000);
    expect(retencion.seniaTotalCentavos).toBe(1_200_000);
  });

  it('rechaza un profesional que no presta ese servicio', async () => {
    const opcion = await primeraOpcion(contexto.ids.conSeniaId);
    const bloques = aBloques(opcion).map((bloque) => ({
      ...bloque,
      profesionalId: contexto.ids.betoId,
    }));

    await expect(
      contexto.reservas.retener({ sucursalId: contexto.ids.sucursalId, bloques }),
    ).rejects.toThrow(/no presta/);
  });

  it('rechaza una duración que no coincide con la del servicio', async () => {
    const opcion = await primeraOpcion(contexto.ids.corteId);
    const bloques = aBloques(opcion).map((bloque) => ({
      ...bloque,
      // Se intenta acortar el turno a la mitad para pagar menos tiempo de silla.
      terminaEn: new Date(new Date(bloque.comienzaEn).getTime() + 30 * 60_000).toISOString(),
    }));

    await expect(
      contexto.reservas.retener({ sucursalId: contexto.ids.sucursalId, bloques }),
    ).rejects.toThrow(/duración enviada no coincide/);
  });

  it('rechaza un horario fuera del horario de atención', async () => {
    const opcion = await primeraOpcion(contexto.ids.corteId);
    const bloques = aBloques(opcion).map((bloque) => ({
      ...bloque,
      comienzaEn: `${JUEVES}T04:00:00.000Z`,
      terminaEn: `${JUEVES}T05:00:00.000Z`,
    }));

    await expect(
      contexto.reservas.retener({ sucursalId: contexto.ids.sucursalId, bloques }),
    ).rejects.toThrow(/fuera del horario/);
  });

  it('rechaza bloques con un hueco entre medio', async () => {
    // Se fija a Ana, que presta los dos servicios: así el único motivo posible
    // de rechazo es el hueco, y no una incompatibilidad de profesional.
    const opcion = await primeraOpcion(contexto.ids.corteId, contexto.ids.anaId);
    const base = aBloques(opcion)[0]!;
    const finPrimero = new Date(base.terminaEn).getTime();

    await expect(
      contexto.reservas.retener({
        sucursalId: contexto.ids.sucursalId,
        bloques: [
          base,
          {
            ...base,
            servicioId: contexto.ids.conSeniaId,
            profesionalId: contexto.ids.anaId,
            orden: 1,
            // Arranca una hora después de que termina el anterior.
            comienzaEn: new Date(finPrimero + 60 * 60_000).toISOString(),
            terminaEn: new Date(finPrimero + 120 * 60_000).toISOString(),
          },
        ],
      }),
    ).rejects.toThrow(/uno detrás del otro/);
  });

  it('rechaza un horario que ya pasó', async () => {
    const ayer = new Date(Date.now() - 24 * 3_600_000);

    await expect(
      contexto.reservas.retener({
        sucursalId: contexto.ids.sucursalId,
        bloques: [
          {
            servicioId: contexto.ids.corteId,
            profesionalId: contexto.ids.anaId,
            orden: 0,
            comienzaEn: ayer.toISOString(),
            terminaEn: new Date(ayer.getTime() + 3_600_000).toISOString(),
          },
        ],
      }),
    ).rejects.toThrow(/ya pasó/);
  });
});

describe('gestión sin cuenta', () => {
  async function reservaConfirmada() {
    const opcion = await primeraOpcion(contexto.ids.corteId);
    const retencion = await contexto.reservas.retener({
      sucursalId: contexto.ids.sucursalId,
      bloques: aBloques(opcion),
    });

    await contexto.reservas.confirmar({ token: retencion.token, cliente: CLIENTE });

    return retencion;
  }

  it('consulta la reserva con el token del enlace', async () => {
    const retencion = await reservaConfirmada();
    const reserva = await contexto.reservas.consultar(retencion.token);

    expect(reserva.id).toBe(retencion.reservaId);
    expect(reserva.puedeGestionarse).toBe(true);
    expect(reserva.horasMinimasCancelacion).toBe(24);
  });

  it('un token inventado no encuentra nada', async () => {
    await expect(contexto.reservas.consultar('token-que-no-existe')).rejects.toThrow(
      /No encontramos/,
    );
  });

  it('cancela sola cuando falta más de la anticipación mínima', async () => {
    const retencion = await reservaConfirmada();

    const resultado = await contexto.reservas.cancelar(retencion.token, null);

    expect(resultado.resultado).toBe('cancelada');
    expect((await contexto.reservas.consultar(retencion.token)).estado).toBe('cancelada');
  });

  it('al cancelar libera el horario', async () => {
    const opcion = await primeraOpcion(contexto.ids.corteId, contexto.ids.anaId);
    const retencion = await contexto.reservas.retener({
      sucursalId: contexto.ids.sucursalId,
      bloques: aBloques(opcion),
    });
    await contexto.reservas.confirmar({ token: retencion.token, cliente: CLIENTE });
    await contexto.reservas.cancelar(retencion.token, null);

    const { opciones } = await contexto.disponibilidad.buscar({
      sucursalId: contexto.ids.sucursalId,
      servicios: [{ servicioId: contexto.ids.corteId, profesionalId: contexto.ids.anaId }],
      desde: `${JUEVES}T00:00:00.000Z`,
      hasta: `${JUEVES}T23:59:00.000Z`,
    });

    expect(opciones.some((otra) => otra.comienzaEn === opcion.comienzaEn)).toBe(true);
  });

  it('deja una solicitud cuando ya no hay anticipación, sin liberar el horario', async () => {
    const retencion = await reservaConfirmada();

    // Se acerca el turno para que caiga dentro del plazo mínimo.
    await contexto.ejecutar(
      `UPDATE reservas SET comienza_en = now() + interval '2 hours',
         termina_en = now() + interval '3 hours' WHERE id = $1`,
      [retencion.reservaId],
    );

    const resultado = await contexto.reservas.cancelar(retencion.token, 'Me surgió algo');

    expect(resultado.resultado).toBe('solicitada');

    // Sigue confirmada: el horario no se libera hasta que gerencia resuelva.
    const reserva = await contexto.reservas.consultar(retencion.token);
    expect(reserva.estado).toBe('confirmada');
    expect(reserva.puedeGestionarse).toBe(false);

    const solicitudes = await contexto.ejecutar(
      `SELECT tipo, estado, motivo FROM solicitudes_cambio WHERE reserva_id = $1`,
      [retencion.reservaId],
    );

    expect(solicitudes.rows[0]).toMatchObject({
      tipo: 'cancelacion',
      estado: 'pendiente',
      motivo: 'Me surgió algo',
    });
  });

  it('no admite dos solicitudes en curso para la misma reserva', async () => {
    const retencion = await reservaConfirmada();

    await contexto.ejecutar(
      `UPDATE reservas SET comienza_en = now() + interval '2 hours',
         termina_en = now() + interval '3 hours' WHERE id = $1`,
      [retencion.reservaId],
    );

    await contexto.reservas.cancelar(retencion.token, null);

    await expect(contexto.reservas.cancelar(retencion.token, null)).rejects.toThrow(
      /pedido en curso/,
    );
  });

  it('reprograma a otro horario y libera el anterior', async () => {
    const opcion = await primeraOpcion(contexto.ids.corteId, contexto.ids.anaId);
    const retencion = await contexto.reservas.retener({
      sucursalId: contexto.ids.sucursalId,
      bloques: aBloques(opcion),
    });
    await contexto.reservas.confirmar({ token: retencion.token, cliente: CLIENTE });

    const { opciones } = await contexto.disponibilidad.buscar({
      sucursalId: contexto.ids.sucursalId,
      servicios: [{ servicioId: contexto.ids.corteId, profesionalId: contexto.ids.anaId }],
      desde: `${JUEVES}T00:00:00.000Z`,
      hasta: `${JUEVES}T23:59:00.000Z`,
    });

    const nueva = opciones.find((otra) => otra.comienzaEn !== opcion.comienzaEn)!;

    const resultado = await contexto.reservas.reprogramar(retencion.token, {
      sucursalId: contexto.ids.sucursalId,
      bloques: aBloques(nueva),
    });

    expect(resultado.resultado).toBe('reprogramada');

    const reserva = await contexto.reservas.consultar(retencion.token);
    expect(reserva.comienzaEn).toBe(nueva.comienzaEn);
    expect(reserva.bloques).toHaveLength(1);
  });

  it('no permite mover una reserva a otra sucursal', async () => {
    const retencion = await reservaConfirmada();
    const otraSucursal = await contexto.ejecutar(
      `INSERT INTO sucursales (nombre, barrio, direccion) VALUES ('Otra', 'Otro', 'Calle 2') RETURNING id`,
    );

    await expect(
      contexto.reservas.reprogramar(retencion.token, {
        sucursalId: otraSucursal.rows[0]?.id ?? '',
        bloques: [],
      }),
    ).rejects.toThrow(/otra sucursal/);
  });
});
