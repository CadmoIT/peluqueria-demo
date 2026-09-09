// Verifica que el esquema haga cumplir las reglas del negocio en la base.
//
// Lo que se prueba acá son garantías que la aplicación no puede dar por sí
// sola: dos peticiones concurrentes pueden pasar ambas la verificación previa
// en memoria, y sólo la base evita que terminen en doble reserva.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  agregarBloque,
  crearBaseEfimera,
  type BaseEfimera,
  crearReserva,
  sembrarMinimo,
  type Semilla,
} from './base-efimera';

let bd: BaseEfimera;
let semilla: Semilla;

beforeEach(async () => {
  bd = await crearBaseEfimera();
  semilla = await sembrarMinimo(bd);
});

afterEach(async () => {
  await bd.close();
});

/** Crea una reserva de una hora que arranca a la hora indicada. */
async function reservaDe(hora: number, token: string): Promise<string> {
  const dos = (valor: number) => String(valor).padStart(2, '0');

  return crearReserva(bd, semilla, {
    comienzaEn: `2026-10-01T${dos(hora)}:00:00Z`,
    terminaEn: `2026-10-01T${dos(hora + 1)}:00:00Z`,
    token,
  });
}

describe('migraciones', () => {
  it('crea las 17 tablas del modelo', async () => {
    const resultado = await bd.query<{ nombre: string }>(
      `SELECT table_name AS nombre FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
    );

    const tablas = resultado.rows.map((fila) => fila.nombre);

    expect(tablas).toEqual(
      expect.arrayContaining([
        'auditoria',
        'configuracion_negocio',
        'excepciones_horario',
        'horarios_semanales',
        'notificaciones',
        'pagos',
        'profesionales',
        'profesionales_servicios',
        'profesionales_sucursales',
        'reservas',
        'reservas_servicios',
        'servicios',
        'servicios_sucursales',
        'sesiones',
        'solicitudes_cambio',
        'sucursales',
        'usuarios',
      ]),
    );
  });

  it('deja instalada la extensión btree_gist', async () => {
    const resultado = await bd.query<{ extname: string }>(
      `SELECT extname FROM pg_extension WHERE extname = 'btree_gist'`,
    );

    expect(resultado.rows).toHaveLength(1);
  });
});

describe('exclusión de solapamiento', () => {
  it('rechaza dos bloques superpuestos del mismo profesional', async () => {
    const primera = await reservaDe(13, 'token-a');
    await agregarBloque(bd, {
      reservaId: primera,
      servicioId: semilla.servicioId,
      profesionalId: semilla.profesionalId,
      comienzaEn: '2026-10-01T13:00:00Z',
      terminaEn: '2026-10-01T14:00:00Z',
    });

    const segunda = await reservaDe(13, 'token-b');

    await expect(
      agregarBloque(bd, {
        reservaId: segunda,
        servicioId: semilla.servicioId,
        profesionalId: semilla.profesionalId,
        comienzaEn: '2026-10-01T13:30:00Z',
        terminaEn: '2026-10-01T14:30:00Z',
      }),
    ).rejects.toThrow(/exclusion constraint/i);
  });

  it('acepta bloques contiguos: uno termina cuando el otro empieza', async () => {
    const primera = await reservaDe(13, 'token-a');
    await agregarBloque(bd, {
      reservaId: primera,
      servicioId: semilla.servicioId,
      profesionalId: semilla.profesionalId,
      comienzaEn: '2026-10-01T13:00:00Z',
      terminaEn: '2026-10-01T14:00:00Z',
    });

    const segunda = await reservaDe(14, 'token-b');

    await expect(
      agregarBloque(bd, {
        reservaId: segunda,
        servicioId: semilla.servicioId,
        profesionalId: semilla.profesionalId,
        comienzaEn: '2026-10-01T14:00:00Z',
        terminaEn: '2026-10-01T15:00:00Z',
      }),
    ).resolves.toBeUndefined();
  });

  it('permite que dos profesionales atiendan en el mismo horario', async () => {
    const primera = await reservaDe(13, 'token-a');
    await agregarBloque(bd, {
      reservaId: primera,
      servicioId: semilla.servicioId,
      profesionalId: semilla.profesionalId,
      comienzaEn: '2026-10-01T13:00:00Z',
      terminaEn: '2026-10-01T14:00:00Z',
    });

    const segunda = await reservaDe(13, 'token-b');

    await expect(
      agregarBloque(bd, {
        reservaId: segunda,
        servicioId: semilla.servicioId,
        profesionalId: semilla.otroProfesionalId,
        comienzaEn: '2026-10-01T13:00:00Z',
        terminaEn: '2026-10-01T14:00:00Z',
      }),
    ).resolves.toBeUndefined();
  });

  it('detecta el choque por el tiempo de limpieza, aunque el cliente vea los turnos contiguos', async () => {
    const primera = await reservaDe(13, 'token-a');

    // Para el cliente el servicio termina 14:00, pero ocupa la silla hasta 14:15.
    await agregarBloque(bd, {
      reservaId: primera,
      servicioId: semilla.servicioConBuffersId,
      profesionalId: semilla.profesionalId,
      comienzaEn: '2026-10-01T13:00:00Z',
      terminaEn: '2026-10-01T14:00:00Z',
      ocupaDesde: '2026-10-01T13:00:00Z',
      ocupaHasta: '2026-10-01T14:15:00Z',
    });

    const segunda = await reservaDe(14, 'token-b');

    await expect(
      agregarBloque(bd, {
        reservaId: segunda,
        servicioId: semilla.servicioId,
        profesionalId: semilla.profesionalId,
        comienzaEn: '2026-10-01T14:00:00Z',
        terminaEn: '2026-10-01T15:00:00Z',
      }),
    ).rejects.toThrow(/exclusion constraint/i);
  });

  it('libera el horario cuando la reserva se cancela', async () => {
    const primera = await reservaDe(13, 'token-a');
    await agregarBloque(bd, {
      reservaId: primera,
      servicioId: semilla.servicioId,
      profesionalId: semilla.profesionalId,
      comienzaEn: '2026-10-01T13:00:00Z',
      terminaEn: '2026-10-01T14:00:00Z',
    });

    await bd.query(`UPDATE reservas SET estado = 'cancelada' WHERE id = $1`, [primera]);

    const segunda = await reservaDe(13, 'token-b');

    await expect(
      agregarBloque(bd, {
        reservaId: segunda,
        servicioId: semilla.servicioId,
        profesionalId: semilla.profesionalId,
        comienzaEn: '2026-10-01T13:00:00Z',
        terminaEn: '2026-10-01T14:00:00Z',
      }),
    ).resolves.toBeUndefined();
  });

  it('una reserva expirada tampoco retiene el horario', async () => {
    const primera = await reservaDe(13, 'token-a');
    await agregarBloque(bd, {
      reservaId: primera,
      servicioId: semilla.servicioId,
      profesionalId: semilla.profesionalId,
      comienzaEn: '2026-10-01T13:00:00Z',
      terminaEn: '2026-10-01T14:00:00Z',
    });

    await bd.query(`UPDATE reservas SET estado = 'expirada' WHERE id = $1`, [primera]);

    const segunda = await reservaDe(13, 'token-b');

    await expect(
      agregarBloque(bd, {
        reservaId: segunda,
        servicioId: semilla.servicioId,
        profesionalId: semilla.profesionalId,
        comienzaEn: '2026-10-01T13:00:00Z',
        terminaEn: '2026-10-01T14:00:00Z',
      }),
    ).resolves.toBeUndefined();
  });
});

describe('propagación de estado', () => {
  it('el bloque hereda el estado de su reserva al insertarse', async () => {
    const reserva = await reservaDe(13, 'token-a');

    await bd.query(`UPDATE reservas SET estado = 'confirmada' WHERE id = $1`, [reserva]);

    await agregarBloque(bd, {
      reservaId: reserva,
      servicioId: semilla.servicioId,
      profesionalId: semilla.profesionalId,
      comienzaEn: '2026-10-01T13:00:00Z',
      terminaEn: '2026-10-01T14:00:00Z',
    });

    const bloques = await bd.query<{ estado: string }>(
      `SELECT estado FROM reservas_servicios WHERE reserva_id = $1`,
      [reserva],
    );

    expect(bloques.rows[0]!.estado).toBe('confirmada');
  });

  it('cambiar el estado de la reserva actualiza todos sus bloques', async () => {
    const reserva = await crearReserva(bd, semilla, {
      comienzaEn: '2026-10-01T13:00:00Z',
      terminaEn: '2026-10-01T15:00:00Z',
      token: 'token-a',
    });

    await agregarBloque(bd, {
      reservaId: reserva,
      servicioId: semilla.servicioId,
      profesionalId: semilla.profesionalId,
      orden: 0,
      comienzaEn: '2026-10-01T13:00:00Z',
      terminaEn: '2026-10-01T14:00:00Z',
    });
    await agregarBloque(bd, {
      reservaId: reserva,
      servicioId: semilla.servicioId,
      profesionalId: semilla.otroProfesionalId,
      orden: 1,
      comienzaEn: '2026-10-01T14:00:00Z',
      terminaEn: '2026-10-01T15:00:00Z',
    });

    await bd.query(`UPDATE reservas SET estado = 'completada' WHERE id = $1`, [reserva]);

    const bloques = await bd.query<{ estado: string }>(
      `SELECT estado FROM reservas_servicios WHERE reserva_id = $1`,
      [reserva],
    );

    expect(bloques.rows).toHaveLength(2);
    expect(bloques.rows.every((fila) => fila.estado === 'completada')).toBe(true);
  });
});
