// Pruebas del filtro que normaliza los errores de la API.
//
// Importa sobre todo que no se pierda el detalle de validación: sin él, el
// cliente recibe un "Bad Request" pelado y no sabe qué campo corregir.
import { BadRequestException, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ExcepcionHttpFiltro, type RespuestaError } from './excepcion-http.filtro';

// El reporte al servicio de errores se intercepta: lo que se verifica es qué
// se le manda, no que llegue a ningún lado.
const reportar = vi.fn();

vi.mock('../../configuracion/observabilidad', () => ({
  reportarExcepcion: (excepcion: unknown, contexto: unknown) => reportar(excepcion, contexto),
}));

/** Simula lo mínimo de Express que el filtro usa. */
function armarHost(ruta = '/api/v1/algo', metodo = 'GET') {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));

  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ url: ruta, method: metodo }),
    }),
  } as unknown as ArgumentsHost;

  return { host, status, json, cuerpo: () => json.mock.calls[0]?.[0] as RespuestaError };
}

beforeEach(() => {
  reportar.mockClear();
});

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

describe('qué se reporta al servicio de errores', () => {
  it('reporta una excepción no controlada', () => {
    // Un 500 es una falla del sistema: alguien tiene que enterarse sin esperar
    // a que un cliente reclame.
    const { host } = armarHost();

    new ExcepcionHttpFiltro().catch(new Error('la base se cayó'), host);

    expect(reportar).toHaveBeenCalledTimes(1);
  });

  it('no reporta un 404', () => {
    // Un identificador que no existe no es una falla, es una respuesta
    // correcta. Reportarlos ahoga la señal.
    const { host } = armarHost();

    new ExcepcionHttpFiltro().catch(new NotFoundException('No existe.'), host);

    expect(reportar).not.toHaveBeenCalled();
  });

  it('no reporta un 401 ni un 409', () => {
    // El panel se llenaría de "401" cada vez que a alguien se le vence la
    // sesión, y de "409" cada vez que dos personas quieren el mismo horario:
    // las dos cosas son el sistema funcionando.
    for (const excepcion of [
      new HttpException('Sin sesión.', HttpStatus.UNAUTHORIZED),
      new HttpException('Horario tomado.', HttpStatus.CONFLICT),
    ]) {
      new ExcepcionHttpFiltro().catch(excepcion, armarHost().host);
    }

    expect(reportar).not.toHaveBeenCalled();
  });

  it('el token del enlace de gestión no sale en la ruta reportada', () => {
    // Es la credencial de la reserva, y viaja en la URL. Sin limpiarla, cada
    // error en esa ruta la deja en el servidor de un tercero.
    const { host } = armarHost('/api/v1/mi-reserva/hnCYIt9GpWhxtscGnwd/cancelar', 'POST');

    new ExcepcionHttpFiltro().catch(new Error('falla'), host);

    const contexto = reportar.mock.calls[0]?.[1] as { ruta: string; metodo: string };

    expect(contexto.ruta).toBe('/api/v1/mi-reserva/[oculto]/cancelar');
    expect(contexto.metodo).toBe('POST');
  });

  it('la respuesta al cliente sí conserva la ruta completa', () => {
    // Quien recibe el error es el dueño de esa reserva: esconderle su propio
    // token no protege a nadie y complica entender qué pasó.
    const { host, cuerpo } = armarHost('/api/v1/mi-reserva/TOKEN');

    new ExcepcionHttpFiltro().catch(new Error('falla'), host);

    expect(cuerpo().ruta).toBe('/api/v1/mi-reserva/TOKEN');
  });
});
