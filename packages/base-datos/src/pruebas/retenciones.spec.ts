// Pruebas de la retención de horarios contra PostgreSQL.
//
// El caso que importa es el de dos personas eligiendo el mismo horario a la
// vez. Ambas pasan la verificación previa y las dos intentan escribir: acá se
// verifica que la base rechace a la segunda y que el error llegue traducido a
// algo que la API pueda devolver.
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { BaseDatos } from '../conexion';
import * as esquemas from '../esquemas/index';
import {
  expirarRetencionesVencidas,
  HorarioNoDisponibleError,
  retenerHorario,
  type BloqueARetener,
} from '../repositorios/retenciones';
import { crearBaseEfimera, sembrarMinimo, type BaseEfimera, type Semilla } from './base-efimera';

let cliente: BaseEfimera;
let bd: BaseDatos;
let semilla: Semilla;

beforeEach(async () => {
  cliente = await crearBaseEfimera();
  semilla = await sembrarMinimo(cliente);
  bd = drizzle(cliente, { schema: esquemas }) as unknown as BaseDatos;
});

afterEach(async () => {
  await cliente.close();
});

function bloque(parcial: Partial<BloqueARetener> = {}): BloqueARetener {
  const comienzaEn = new Date('2026-10-01T13:00:00Z');
  const terminaEn = new Date('2026-10-01T14:00:00Z');

  return {
    servicioId: semilla.servicioId,
    profesionalId: semilla.profesionalId,
    orden: 0,
    comienzaEn,
    terminaEn,
    ocupaDesde: comienzaEn,
    ocupaHasta: terminaEn,
    servicioNombre: 'Corte',
    duracionMinutos: 60,
    precioCentavos: 1_500_000,
    seniaCentavos: 0,
    minutosPreparacion: 0,
    minutosLimpieza: 0,
    ...parcial,
  };
}

describe('retenerHorario', () => {
  it('crea la reserva con sus bloques y la fecha de vencimiento', async () => {
    const antes = Date.now();

    const retencion = await retenerHorario(bd, {
      sucursalId: semilla.sucursalId,
      bloques: [bloque()],
      hashTokenGestion: 'hash-a',
      minutosRetencion: 10,
    });

    expect(retencion.precioTotalCentavos).toBe(1_500_000);
    expect(retencion.retencionExpiraEn.getTime()).toBeGreaterThanOrEqual(antes + 10 * 60_000);

    const filas = await cliente.query<{ estado: string; total: string }>(
      `SELECT r.estado, count(rs.id)::text AS total
       FROM reservas r JOIN reservas_servicios rs ON rs.reserva_id = r.id
       WHERE r.id = $1 GROUP BY r.estado`,
      [retencion.reservaId],
    );

    expect(filas.rows[0]).toMatchObject({ estado: 'pendiente_pago', total: '1' });
  });

  it('retiene los bloques de una reserva multiservicio como una unidad', async () => {
    const retencion = await retenerHorario(bd, {
      sucursalId: semilla.sucursalId,
      bloques: [
        bloque({ orden: 0 }),
        bloque({
          orden: 1,
          profesionalId: semilla.otroProfesionalId,
          comienzaEn: new Date('2026-10-01T14:00:00Z'),
          terminaEn: new Date('2026-10-01T14:30:00Z'),
          ocupaDesde: new Date('2026-10-01T14:00:00Z'),
          ocupaHasta: new Date('2026-10-01T14:30:00Z'),
          precioCentavos: 900_000,
        }),
      ],
      hashTokenGestion: 'hash-a',
      minutosRetencion: 10,
    });

    expect(retencion.comienzaEn.toISOString()).toBe('2026-10-01T13:00:00.000Z');
    expect(retencion.terminaEn.toISOString()).toBe('2026-10-01T14:30:00.000Z');
    expect(retencion.precioTotalCentavos).toBe(2_400_000);
  });

  it('rechaza la segunda retención del mismo horario y profesional', async () => {
    await retenerHorario(bd, {
      sucursalId: semilla.sucursalId,
      bloques: [bloque()],
      hashTokenGestion: 'hash-a',
      minutosRetencion: 10,
    });

    await expect(
      retenerHorario(bd, {
        sucursalId: semilla.sucursalId,
        bloques: [bloque({ comienzaEn: new Date('2026-10-01T13:30:00Z') })],
        hashTokenGestion: 'hash-b',
        minutosRetencion: 10,
      }),
    ).rejects.toBeInstanceOf(HorarioNoDisponibleError);
  });

  it('no deja la reserva a medias cuando un bloque choca', async () => {
    await retenerHorario(bd, {
      sucursalId: semilla.sucursalId,
      bloques: [bloque()],
      hashTokenGestion: 'hash-a',
      minutosRetencion: 10,
    });

    const antes = await cliente.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM reservas`,
    );

    // El primer bloque está libre, el segundo pisa la reserva anterior.
    await expect(
      retenerHorario(bd, {
        sucursalId: semilla.sucursalId,
        bloques: [
          bloque({
            orden: 0,
            comienzaEn: new Date('2026-10-01T11:00:00Z'),
            terminaEn: new Date('2026-10-01T12:00:00Z'),
            ocupaDesde: new Date('2026-10-01T11:00:00Z'),
            ocupaHasta: new Date('2026-10-01T12:00:00Z'),
          }),
          bloque({ orden: 1 }),
        ],
        hashTokenGestion: 'hash-b',
        minutosRetencion: 10,
      }),
    ).rejects.toBeInstanceOf(HorarioNoDisponibleError);

    const despues = await cliente.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM reservas`,
    );

    // La transacción se deshizo entera: no quedó ninguna reserva nueva.
    expect(despues.rows[0]!.total).toBe(antes.rows[0]!.total);
  });

  it('permite retener el mismo horario con otro profesional', async () => {
    await retenerHorario(bd, {
      sucursalId: semilla.sucursalId,
      bloques: [bloque()],
      hashTokenGestion: 'hash-a',
      minutosRetencion: 10,
    });

    await expect(
      retenerHorario(bd, {
        sucursalId: semilla.sucursalId,
        bloques: [bloque({ profesionalId: semilla.otroProfesionalId })],
        hashTokenGestion: 'hash-b',
        minutosRetencion: 10,
      }),
    ).resolves.toBeDefined();
  });
});

describe('expirarRetencionesVencidas', () => {
  async function retenerVencida(token: string): Promise<string> {
    const retencion = await retenerHorario(bd, {
      sucursalId: semilla.sucursalId,
      bloques: [bloque()],
      hashTokenGestion: token,
      minutosRetencion: 10,
    });

    // Se fuerza el vencimiento hacia atrás en vez de esperar diez minutos.
    await cliente.query(
      `UPDATE reservas SET retencion_expira_en = now() - interval '1 minute' WHERE id = $1`,
      [retencion.reservaId],
    );

    return retencion.reservaId;
  }

  it('marca como expiradas las retenciones vencidas', async () => {
    const reservaId = await retenerVencida('hash-a');

    const expiradas = await expirarRetencionesVencidas(bd);

    expect(expiradas).toEqual([reservaId]);
  });

  it('no toca las retenciones que siguen vigentes', async () => {
    await retenerHorario(bd, {
      sucursalId: semilla.sucursalId,
      bloques: [bloque()],
      hashTokenGestion: 'hash-a',
      minutosRetencion: 10,
    });

    expect(await expirarRetencionesVencidas(bd)).toEqual([]);
  });

  it('no toca una reserva ya confirmada aunque tenga fecha de retención vencida', async () => {
    const reservaId = await retenerVencida('hash-a');

    await cliente.query(
      `UPDATE reservas SET estado = 'confirmada', cliente_nombre = 'Cliente',
         canal_contacto = 'whatsapp', contacto_whatsapp = '549110000000',
         acepto_condiciones_en = now() WHERE id = $1`,
      [reservaId],
    );

    expect(await expirarRetencionesVencidas(bd)).toEqual([]);
  });

  it('al expirar libera el horario para otra persona', async () => {
    await retenerVencida('hash-a');

    // Antes de expirar, el horario sigue tomado.
    await expect(
      retenerHorario(bd, {
        sucursalId: semilla.sucursalId,
        bloques: [bloque()],
        hashTokenGestion: 'hash-b',
        minutosRetencion: 10,
      }),
    ).rejects.toBeInstanceOf(HorarioNoDisponibleError);

    await expirarRetencionesVencidas(bd);

    await expect(
      retenerHorario(bd, {
        sucursalId: semilla.sucursalId,
        bloques: [bloque()],
        hashTokenGestion: 'hash-c',
        minutosRetencion: 10,
      }),
    ).resolves.toBeDefined();
  });
});
