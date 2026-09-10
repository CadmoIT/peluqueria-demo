// El chequeo de salud tiene que fallar cuando la base no responde.
//
// La verificación posterior a cada despliegue mira esta ruta, así que un
// chequeo que siempre contesta que sí no informa: tranquiliza. Antes devolvía
// `operativo` sin tocar nada y un despliegue con la base caída pasaba en verde.
import { ServiceUnavailableException } from '@nestjs/common';
import type { BaseDatos } from '@manly/base-datos';
import { describe, expect, it } from 'vitest';

import { SaludControlador } from './salud.controlador';

/** Una conexión que responde. Sólo se le pide `select 1`. */
const baseQueResponde = {
  execute: () => Promise.resolve([{ '?column?': 1 }]),
} as unknown as BaseDatos;

const baseCaida = {
  execute: () => Promise.reject(new Error('connect ECONNREFUSED 10.0.0.1:5432')),
} as unknown as BaseDatos;

describe('SaludControlador', () => {
  it('informa el servicio como operativo cuando la base responde', async () => {
    const respuesta = await new SaludControlador(baseQueResponde).consultar();

    expect(respuesta.estado).toBe('operativo');
    expect(respuesta.baseDatosMs).toBeGreaterThanOrEqual(0);
  });

  it('devuelve una marca de tiempo ISO válida', async () => {
    const respuesta = await new SaludControlador(baseQueResponde).consultar();

    expect(new Date(respuesta.marcaTiempo).toISOString()).toBe(respuesta.marcaTiempo);
  });

  it('responde 503 cuando la base no responde', async () => {
    await expect(new SaludControlador(baseCaida).consultar()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('no filtra el detalle del error de conexión', async () => {
    // La ruta es pública y el mensaje de un error de conexión suele traer el
    // servidor y el usuario de la base.
    let mensaje = '';

    try {
      await new SaludControlador(baseCaida).consultar();
    } catch (error: unknown) {
      mensaje = error instanceof Error ? error.message : '';
    }

    expect(mensaje).not.toContain('ECONNREFUSED');
    expect(mensaje).not.toContain('10.0.0.1');
  });
});
