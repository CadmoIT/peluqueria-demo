// Pruebas del filtro que normaliza los errores de la API.
//
// Importa sobre todo que no se pierda el detalle de validación: sin él, el
// cliente recibe un "Bad Request" pelado y no sabe qué campo corregir.
import { BadRequestException, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { ExcepcionHttpFiltro, type RespuestaError } from './excepcion-http.filtro';

/** Simula lo mínimo de Express que el filtro usa. */
function armarHost(ruta = '/api/v1/algo') {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));

  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ url: ruta }),
    }),
  } as unknown as ArgumentsHost;

  return { host, status, json, cuerpo: () => json.mock.calls[0]?.[0] as RespuestaError };
}

describe('ExcepcionHttpFiltro', () => {
  it('conserva el detalle de una validación fallida', () => {
    const { host, status, cuerpo } = armarHost();
    const detalles = [{ campo: 'sucursalId', motivo: 'Invalid uuid' }];

    new ExcepcionHttpFiltro().catch(
      new BadRequestException({ mensaje: 'Los datos enviados no son válidos.', detalles }),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(cuerpo()).toMatchObject({
      estado: 400,
      mensaje: 'Los datos enviados no son válidos.',
      detalles,
    });
  });

  it('usa el mensaje de una excepción HTTP simple', () => {
    const { host, cuerpo } = armarHost('/api/v1/no-existe');

    new ExcepcionHttpFiltro().catch(new NotFoundException('No se encontró la reserva.'), host);

    expect(cuerpo()).toMatchObject({
      estado: 404,
      mensaje: 'No se encontró la reserva.',
      ruta: '/api/v1/no-existe',
    });
  });

  it('no filtra detalles internos de un error inesperado', () => {
    const { host, status, cuerpo } = armarHost();

    new ExcepcionHttpFiltro().catch(new Error('la contraseña de la base es hunter2'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(cuerpo().mensaje).toBe('Error interno del servidor.');
    expect(JSON.stringify(cuerpo())).not.toContain('hunter2');
  });

  it('omite el campo de detalles cuando no hay ninguno', () => {
    const { host, cuerpo } = armarHost();

    new ExcepcionHttpFiltro().catch(new HttpException('Conflicto', HttpStatus.CONFLICT), host);

    expect(cuerpo()).not.toHaveProperty('detalles');
  });

  it('siempre informa la ruta y una marca de tiempo válida', () => {
    const { host, cuerpo } = armarHost('/api/v1/reservas');

    new ExcepcionHttpFiltro().catch(new NotFoundException(), host);

    expect(cuerpo().ruta).toBe('/api/v1/reservas');
    expect(new Date(cuerpo().marcaTiempo).toISOString()).toBe(cuerpo().marcaTiempo);
  });
});
