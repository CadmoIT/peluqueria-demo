// Verifica que las semillas corran y sean idempotentes.
//
// Una semilla que falla la segunda vez que se ejecuta es una trampa: rompe
// cualquier despliegue que la vuelva a correr.
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as esquemas from '../esquemas/index';
import { asegurarConfiguracion, cargarDemostracion, type BaseSembrable } from '../semillas/index';
import { crearBaseEfimera, type BaseEfimera } from './base-efimera';

let cliente: BaseEfimera;
let bd: BaseSembrable;

beforeEach(async () => {
  cliente = await crearBaseEfimera();
  bd = drizzle(cliente, { schema: esquemas }) as unknown as BaseSembrable;
});

afterEach(async () => {
  await cliente.close();
});

describe('asegurarConfiguracion', () => {
  it('crea la fila de configuración', async () => {
    await asegurarConfiguracion(bd);

    const filas = await cliente.query(`SELECT * FROM configuracion_negocio`);

    expect(filas.rows).toHaveLength(1);
  });

  it('no duplica la fila al correr dos veces', async () => {
    await asegurarConfiguracion(bd);
    await asegurarConfiguracion(bd);

    const filas = await cliente.query(`SELECT * FROM configuracion_negocio`);

    expect(filas.rows).toHaveLength(1);
  });
});

describe('cargarDemostracion', () => {
  it('carga sucursales, servicios, profesionales y sus relaciones', async () => {
    await cargarDemostracion(bd);

    const contar = async (tabla: string): Promise<number> => {
      const resultado = await cliente.query<{ total: string }>(
        `SELECT count(*)::text AS total FROM ${tabla}`,
      );
      return Number(resultado.rows[0]!.total);
    };

    expect(await contar('sucursales')).toBe(3);
    expect(await contar('servicios')).toBe(4);
    expect(await contar('profesionales')).toBe(3);
    // 4 servicios x 3 sucursales, 3 profesionales x 3 sucursales, 3 x 4 servicios.
    expect(await contar('servicios_sucursales')).toBe(12);
    expect(await contar('profesionales_sucursales')).toBe(9);
    expect(await contar('profesionales_servicios')).toBe(12);
    // 9 pares profesional-sucursal por 6 días (lunes a sábado).
    expect(await contar('horarios_semanales')).toBe(54);
  });

  it('no duplica nada al correr dos veces', async () => {
    await cargarDemostracion(bd);
    await cargarDemostracion(bd);

    const resultado = await cliente.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM sucursales`,
    );

    expect(Number(resultado.rows[0]!.total)).toBe(3);
  });

  it('el servicio con seña porcentual respeta el CHECK del esquema', async () => {
    await cargarDemostracion(bd);

    const resultado = await cliente.query<{
      modalidad_senia: string;
      senia_porcentaje: number;
      minutos_limpieza: number;
    }>(
      `SELECT modalidad_senia, senia_porcentaje, minutos_limpieza FROM servicios WHERE nombre = 'Color'`,
    );

    expect(resultado.rows[0]).toMatchObject({
      modalidad_senia: 'porcentual',
      senia_porcentaje: 30,
      minutos_limpieza: 15,
    });
  });
});
