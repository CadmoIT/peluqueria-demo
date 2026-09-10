// Pruebas de qué sale y qué no.
//
// Es el archivo del repositorio donde un error se paga más caro y se nota
// menos: si algo se filtra, todo sigue funcionando igual y el dato ya está en
// el servidor de un tercero. No hay forma de darse cuenta mirando la aplicación.
//
// Por eso cada prueba nombra el dato concreto que no puede salir, y no "los
// datos sensibles" en abstracto.
import { describe, expect, it } from 'vitest';

import { limpiarEvento, limpiarObjeto, limpiarUrl, OCULTO } from './limpieza';

describe('URL con token', () => {
  it('tapa el token del enlace de gestión', () => {
    // El token no identifica una reserva: **es la credencial**. Quien lo tenga
    // puede ver y cancelar el turno de otra persona.
    expect(limpiarUrl('/api/v1/mi-reserva/hnCYIt9GpWhxtscGnwd582L')).toBe(
      `/api/v1/mi-reserva/${OCULTO}`,
    );
  });

  it('deja legible qué se estaba haciendo', () => {
    expect(limpiarUrl('/api/v1/mi-reserva/abc123/cancelar')).toBe(
      `/api/v1/mi-reserva/${OCULTO}/cancelar`,
    );
  });

  it('tapa el token de invitación', () => {
    // Con este token se define la contraseña de una cuenta de gerencia.
    expect(limpiarUrl('https://manly.com.ar/panel/invitacion/TOKEN')).toBe(
      `https://manly.com.ar/panel/invitacion/${OCULTO}`,
    );
  });

  it('tapa el token de recuperación', () => {
    expect(limpiarUrl('/panel/recuperar/TOKEN')).toBe(`/panel/recuperar/${OCULTO}`);
  });

  it('tapa el token de consulta de pago', () => {
    expect(limpiarUrl('/api/v1/pagos/estado/TOKEN')).toBe(`/api/v1/pagos/estado/${OCULTO}`);
  });

  it('descarta la cadena de consulta entera', () => {
    // Hoy no lleva nada sensible. Alcanza con que alguien agregue un parámetro
    // mañana para que empiece a llevarlo, y ese cambio no se vería en ninguna
    // revisión de este archivo.
    expect(limpiarUrl('/api/v1/panel/agenda?sucursalId=abc&desde=2026-01-01')).toBe(
      `/api/v1/panel/agenda?${OCULTO}`,
    );
  });

  it('no toca una ruta sin token', () => {
    expect(limpiarUrl('/api/v1/panel/agenda')).toBe('/api/v1/panel/agenda');
  });
});

describe('objetos con datos de personas', () => {
  it('tapa el nombre, el teléfono y el correo del cliente', () => {
    const limpio = limpiarObjeto({
      clienteNombre: 'Martín Pereyra',
      contactoWhatsapp: '5491155551234',
      contactoEmail: 'martin@ejemplo.com',
      comienzaEn: '2026-09-10T14:00:00.000Z',
    }) as Record<string, unknown>;

    expect(limpio.clienteNombre).toBe(OCULTO);
    expect(limpio.contactoWhatsapp).toBe(OCULTO);
    expect(limpio.contactoEmail).toBe(OCULTO);
    // La hora del turno sí sirve para diagnosticar y no dice quién es nadie.
    expect(limpio.comienzaEn).toBe('2026-09-10T14:00:00.000Z');
  });

  it('tapa contraseñas y cabeceras de autenticación', () => {
    const limpio = limpiarObjeto({
      contrasenia: 'una-frase-larga',
      authorization: 'Bearer abc',
      cookie: 'manly_sesion=xyz',
    }) as Record<string, unknown>;

    expect(Object.values(limpio)).toEqual([OCULTO, OCULTO, OCULTO]);
  });

  it('busca dentro de la clave, no la compara entera', () => {
    // `destinoEmail` o `emailDelCliente` tienen que caer igual que `email`.
    const limpio = limpiarObjeto({
      destinoEmail: 'x@y.com',
      emailDelCliente: 'x@y.com',
      EMAIL: 'x@y.com',
    }) as Record<string, unknown>;

    expect(Object.values(limpio)).toEqual([OCULTO, OCULTO, OCULTO]);
  });

  it('entra en objetos anidados y en listas', () => {
    const limpio = limpiarObjeto({
      reserva: { bloques: [{ duracionMinutos: 45, clienteNombre: 'Martín' }] },
    }) as { reserva: { bloques: { duracionMinutos: number; clienteNombre: string }[] } };

    expect(limpio.reserva.bloques[0]?.clienteNombre).toBe(OCULTO);
    expect(limpio.reserva.bloques[0]?.duracionMinutos).toBe(45);
  });

  it('tapa de más antes que de menos', () => {
    // `servicioNombre` es "Corte" y no el nombre de nadie, pero contiene
    // «nombre» y cae igual. Es a propósito: la lista busca dentro de la clave,
    // y afinarla para dejar pasar éste abre la puerta a que se escape el
    // próximo campo que alguien agregue con un nombre parecido.
    //
    // El costo es un reporte menos informativo; el de equivocarse al revés es
    // el nombre de un cliente en el servidor de un tercero.
    const limpio = limpiarObjeto({ servicioNombre: 'Corte' }) as Record<string, unknown>;

    expect(limpio.servicioNombre).toBe(OCULTO);
  });

  it('limpia los tokens dentro de una URL guardada en un campo', () => {
    const limpio = limpiarObjeto({
      urlDeVuelta: 'https://manly.com.ar/mi-reserva/TOKEN',
    }) as Record<string, unknown>;

    expect(limpio.urlDeVuelta).toBe(`https://manly.com.ar/mi-reserva/${OCULTO}`);
  });

  it('no se cuelga con una estructura cíclica', () => {
    const ciclico: Record<string, unknown> = { nivel: 1 };

    ciclico.propio = ciclico;

    expect(() => limpiarObjeto(ciclico)).not.toThrow();
  });
});

describe('evento completo', () => {
  it('descarta el cuerpo de la petición', () => {
    // Es donde viajan el nombre, el teléfono y el correo de quien reserva, y no
    // hace falta para saber por qué falló una consulta.
    const limpio = limpiarEvento({
      request: {
        url: '/api/v1/reservas',
        data: { cliente: { nombre: 'Martín', email: 'martin@ejemplo.com' } },
      },
    });

    expect(limpio.request?.data).toBe(OCULTO);
  });

  it('descarta las cookies, que llevan la sesión del panel', () => {
    const limpio = limpiarEvento({
      request: { url: '/api/v1/panel/agenda', cookies: 'manly_sesion=abc123' },
    });

    expect(limpio.request?.cookies).toBe(OCULTO);
  });

  it('del usuario deja sólo el identificador', () => {
    // El id no dice nada de nadie sin la base adelante; el nombre y el correo
    // no aportan al diagnóstico.
    const limpio = limpiarEvento({
      user: { id: 'abc-123', email: 'gerencia@manly.ar', nombre: 'Gerencia' },
    });

    expect(limpio.user).toEqual({ id: 'abc-123' });
  });

  it('limpia las migas de pan, que guardan cada navegación', () => {
    const limpio = limpiarEvento({
      breadcrumbs: [
        { message: 'GET /api/v1/mi-reserva/TOKEN' },
        { message: 'consulta', data: { contactoEmail: 'x@y.com' } },
      ],
    });

    expect(limpio.breadcrumbs?.[0]?.message).toBe(`GET /api/v1/mi-reserva/${OCULTO}`);
    expect((limpio.breadcrumbs?.[1]?.data as Record<string, unknown>).contactoEmail).toBe(OCULTO);
  });

  it('limpia el contexto que agrega quien reporta', () => {
    // Es la vía por la que un dato entra sin pasar por ningún otro control:
    // alcanza con un `setContext('reserva', reserva)` para mandar el nombre y
    // el teléfono del cliente.
    //
    // Faltaba, y se descubrió mandando un evento de prueba a un receptor local
    // y leyendo lo que salía: revisando el código, la política parecía completa.
    const limpio = limpiarEvento({
      contexts: {
        peticion: { ruta: '/api/v1/mi-reserva/TOKEN/cancelar' },
        reserva: { clienteNombre: 'Martín', comienzaEn: '2026-09-10T14:00:00.000Z' },
      },
    });

    const peticion = limpio.contexts?.peticion as { ruta: string };
    const reserva = limpio.contexts?.reserva as Record<string, unknown>;

    expect(peticion.ruta).toBe(`/api/v1/mi-reserva/${OCULTO}/cancelar`);
    expect(reserva.clienteNombre).toBe(OCULTO);
    expect(reserva.comienzaEn).toBe('2026-09-10T14:00:00.000Z');
  });

  it('limpia las etiquetas', () => {
    const limpio = limpiarEvento({ tags: { cola: 'despachar', destino: '5491155551234' } });

    expect(limpio.tags?.cola).toBe('despachar');
    expect(limpio.tags?.destino).toBe(OCULTO);
  });

  it('no rompe un evento que no trae nada de eso', () => {
    const limpio = limpiarEvento({ extra: { intento: 3 } });

    expect(limpio.extra).toEqual({ intento: 3 });
  });
});
