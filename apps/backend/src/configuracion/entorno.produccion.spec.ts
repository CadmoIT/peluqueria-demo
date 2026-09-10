// Comprobaciones de configuración que sólo rigen en producción.
//
// Cada una de estas pruebas corresponde a un despliegue que habría funcionado
// —sin errores, sin alertas— y habría estado mal de una forma cara: turnos
// regalados, pagos falsificables, enlaces a localhost. Los valores por defecto
// existen para que `pnpm dev` arranque sin configurar nada, y son exactamente
// los que no pueden llegar a producción.
import { describe, expect, it } from 'vitest';

import { validarEntorno } from './entorno';

const PRODUCCION_VALIDA = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://usuario:clave@servidor/manly',
  MP_ACCESS_TOKEN: 'APP_USR-token-real',
  MP_SECRETO_WEBHOOK: 'un-secreto-de-verdad',
  NEXT_PUBLIC_URL_PUBLICA: 'https://manly.com.ar',
  URL_PUBLICA_API: 'https://api.manly.com.ar/api/v1',
  ORIGENES_PERMITIDOS: 'https://manly.com.ar',
};

describe('validación de entorno', () => {
  it('acepta una configuración de producción completa', () => {
    expect(() => validarEntorno(PRODUCCION_VALIDA)).not.toThrow();
  });

  it('arranca en desarrollo sin configurar casi nada', () => {
    // Es el caso de quien clona el repositorio: con la cadena de conexión
    // alcanza, y la pasarela simulada cubre el resto.
    expect(() =>
      validarEntorno({ DATABASE_URL: 'postgresql://manly:manly@localhost:5432/manly' }),
    ).not.toThrow();
  });

  it('no arranca sin cadena de conexión', () => {
    expect(() => validarEntorno({})).toThrow(/DATABASE_URL/);
  });

  describe('en producción', () => {
    it('rechaza el secreto de webhook de desarrollo', () => {
      // Con este secreto, cualquiera que lea el repositorio puede firmar una
      // notificación de pago y confirmar reservas sin pagarlas.
      expect(() =>
        validarEntorno({ ...PRODUCCION_VALIDA, MP_SECRETO_WEBHOOK: 'secreto-de-desarrollo' }),
      ).toThrow(/MP_SECRETO_WEBHOOK/);
    });

    it('rechaza quedarse sin token de Mercado Pago', () => {
      // Sin token se activa la pasarela simulada, que aprueba todo: los turnos
      // saldrían gratis y nadie se enteraría hasta cerrar la caja.
      const { MP_ACCESS_TOKEN: _, ...sinToken } = PRODUCCION_VALIDA;

      expect(() => validarEntorno(sinToken)).toThrow(/MP_ACCESS_TOKEN/);
    });

    it('rechaza las URL en localhost', () => {
      // Los enlaces de gestión y de invitación que se le mandan a la gente
      // llevarían a la máquina de quien desplegó.
      expect(() =>
        validarEntorno({ ...PRODUCCION_VALIDA, NEXT_PUBLIC_URL_PUBLICA: 'http://localhost:3000' }),
      ).toThrow(/NEXT_PUBLIC_URL_PUBLICA/);

      expect(() =>
        validarEntorno({ ...PRODUCCION_VALIDA, ORIGENES_PERMITIDOS: 'http://localhost:3000' }),
      ).toThrow(/ORIGENES_PERMITIDOS/);
    });

    it('junta todas las faltas en un solo error', () => {
      // Arreglarlas de a una, redesplegando cada vez, sería una tarde perdida.
      let mensaje = '';

      try {
        validarEntorno({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://x/y' });
      } catch (error: unknown) {
        mensaje = error instanceof Error ? error.message : '';
      }

      expect(mensaje).toContain('MP_ACCESS_TOKEN');
      expect(mensaje).toContain('MP_SECRETO_WEBHOOK');
      expect(mensaje).toContain('ORIGENES_PERMITIDOS');
    });
  });
});
