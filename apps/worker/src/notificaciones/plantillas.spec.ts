// Pruebas de las plantillas.
//
// Lo que importa acá es que el mensaje diga lo correcto y que el contrato con
// Meta no cambie sin querer: el nombre de la plantilla y el orden de sus
// parámetros están registrados del lado de ellos, y tocarlos exige volver a
// pedir aprobación.
import { describe, expect, it } from 'vitest';

import { armarMensaje, TIPOS_MENSAJE, type DatosMensaje } from './plantillas';

const DATOS: DatosMensaje = {
  clienteNombre: 'Nicolás',
  sucursalNombre: 'Las Cañitas',
  sucursalDireccion: 'Báez 300',
  // Jueves 1 de octubre de 2026, 15:30 hora de Buenos Aires.
  comienzaEn: '2026-10-01T18:30:00.000Z',
  servicios: ['Corte', 'Barba'],
  urlGestion: 'https://manly.com.ar/mi-reserva/abc123',
  horasMinimasCancelacion: 24,
};

describe('formato de fecha y hora', () => {
  it('escribe la fecha en la zona del negocio, no en UTC', () => {
    const mensaje = armarMensaje('confirmacion', DATOS);

    // 18:30 UTC son las 15:30 en Buenos Aires.
    expect(mensaje.texto).toContain('15:30');
    expect(mensaje.texto).not.toContain('18:30');
  });

  it('escribe el día en español', () => {
    const mensaje = armarMensaje('confirmacion', DATOS);

    expect(mensaje.texto).toContain('jueves 1 de octubre');
  });

  it('usa reloj de 24 horas', () => {
    const tarde = armarMensaje('confirmacion', {
      ...DATOS,
      comienzaEn: '2026-10-01T22:00:00.000Z',
    });

    expect(tarde.texto).toContain('19:00');
    expect(tarde.texto).not.toMatch(/p\.\s?m\./);
  });
});

describe('contenido de los mensajes', () => {
  it('la confirmación lleva el enlace de gestión y el plazo para cambiar', () => {
    const mensaje = armarMensaje('confirmacion', DATOS);

    expect(mensaje.texto).toContain(DATOS.urlGestion);
    expect(mensaje.texto).toContain('24 horas antes');
    expect(mensaje.texto).toContain('Báez 300');
  });

  it('enumera varios servicios de forma legible', () => {
    const mensaje = armarMensaje('confirmacion', DATOS);

    expect(mensaje.texto).toContain('Corte y Barba');
  });

  it('con tres servicios usa comas y una sola "y"', () => {
    const mensaje = armarMensaje('confirmacion', {
      ...DATOS,
      servicios: ['Corte', 'Barba', 'Color'],
    });

    expect(mensaje.texto).toContain('Corte, Barba y Color');
  });

  it('con un solo servicio no agrega conectores', () => {
    const mensaje = armarMensaje('confirmacion', { ...DATOS, servicios: ['Corte'] });

    expect(mensaje.texto).toContain('Corte\n');
    expect(mensaje.texto).not.toContain('Corte y');
  });

  it('la cancelación no invita a presentarse', () => {
    const mensaje = armarMensaje('cancelacion', DATOS);

    expect(mensaje.texto).toMatch(/cancelamos/i);
    expect(mensaje.texto).not.toContain(DATOS.urlGestion);
  });

  it('el segundo recordatorio dice dónde es, que es lo que hace falta a esa altura', () => {
    const mensaje = armarMensaje('recordatorio_segundo', DATOS);

    expect(mensaje.texto).toContain('Báez 300');
    expect(mensaje.texto).toContain('Las Cañitas');
  });

  it('la reprogramación dice el horario nuevo', () => {
    const mensaje = armarMensaje('reprogramacion', DATOS);

    expect(mensaje.texto).toContain('15:30');
    expect(mensaje.texto).toContain(DATOS.urlGestion);
  });
});

describe('contrato con Meta', () => {
  it('cada tipo declara una plantilla con nombre propio', () => {
    const nombres = TIPOS_MENSAJE.map((tipo) => armarMensaje(tipo, DATOS).plantilla);

    expect(new Set(nombres).size).toBe(nombres.length);
    expect(nombres.every((nombre) => nombre.startsWith('manly_'))).toBe(true);
  });

  it('ningún parámetro va vacío, porque Meta los rechaza', () => {
    for (const tipo of TIPOS_MENSAJE) {
      const mensaje = armarMensaje(tipo, DATOS);

      expect(mensaje.parametros.every((valor) => valor.length > 0)).toBe(true);
    }
  });

  it('los parámetros de la confirmación van en el orden registrado', () => {
    const mensaje = armarMensaje('confirmacion', DATOS);

    expect(mensaje.parametros).toEqual([
      'Nicolás',
      'Corte y Barba',
      'jueves 1 de octubre a las 15:30',
      'Las Cañitas',
      'https://manly.com.ar/mi-reserva/abc123',
    ]);
  });

  it('todos los tipos tienen asunto y cuerpo', () => {
    for (const tipo of TIPOS_MENSAJE) {
      const mensaje = armarMensaje(tipo, DATOS);

      expect(mensaje.asunto.length).toBeGreaterThan(0);
      expect(mensaje.texto.length).toBeGreaterThan(20);
    }
  });

  it('rechaza un tipo que no existe en vez de mandar un mensaje vacío', () => {
    expect(() => armarMensaje('inventado' as never, DATOS)).toThrow(/No hay plantilla/);
  });
});
