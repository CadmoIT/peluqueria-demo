// Verifica que el endpoint de salud informe el estado esperado.
import { describe, expect, it } from 'vitest';

import { SaludControlador } from './salud.controlador';

describe('SaludControlador', () => {
  it('informa el servicio como operativo', () => {
    const respuesta = new SaludControlador().consultar();

    expect(respuesta.estado).toBe('operativo');
  });

  it('devuelve una marca de tiempo ISO válida', () => {
    const respuesta = new SaludControlador().consultar();

    expect(new Date(respuesta.marcaTiempo).toISOString()).toBe(respuesta.marcaTiempo);
  });
});
