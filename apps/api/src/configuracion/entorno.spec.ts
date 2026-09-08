// Verifica que el arranque falle temprano ante un entorno incompleto o inválido.
import { describe, expect, it } from 'vitest';

import { origenesPermitidos, validarEntorno } from './entorno';

const entornoMinimo = {
  DATABASE_URL: 'postgresql://manly:manly@localhost:5432/manly',
};

describe('validarEntorno', () => {
  it('aplica los valores por defecto cuando sólo se da lo obligatorio', () => {
    const entorno = validarEntorno(entornoMinimo);

    expect(entorno.API_PUERTO).toBe(3001);
    expect(entorno.API_PREFIJO).toBe('api/v1');
    expect(entorno.ZONA_HORARIA).toBe('America/Argentina/Buenos_Aires');
  });

  it('falla si falta la cadena de conexión', () => {
    expect(() => validarEntorno({})).toThrow(/DATABASE_URL/);
  });

  it('falla si el puerto no es un número', () => {
    expect(() => validarEntorno({ ...entornoMinimo, API_PUERTO: 'ochenta' })).toThrow(/API_PUERTO/);
  });
});

describe('origenesPermitidos', () => {
  it('separa la lista y descarta los espacios sobrantes', () => {
    expect(origenesPermitidos('http://a.com, http://b.com ,')).toEqual([
      'http://a.com',
      'http://b.com',
    ]);
  });
});
