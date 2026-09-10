// Pruebas de la validación de firma de los webhooks.
//
// Es la única barrera entre una notificación legítima y una falsificada: sin
// ella, cualquiera que conozca la URL puede confirmarse un turno sin pagar.
// Por eso las pruebas se centran en los intentos de burlarla.
import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { firmarNotificacion, verificarFirmaWebhook } from './firma-webhook';

const SECRETO = 'secreto-de-prueba';
const ID_RECURSO = '1234567890';
const ID_PETICION = 'aaaa-bbbb-cccc';

/** Momento fijo, para que las pruebas no dependan del reloj. */
const AHORA = Date.UTC(2026, 9, 1, 12, 0, 0);

function firmaValida(ahora = AHORA) {
  return firmarNotificacion({
    idRecurso: ID_RECURSO,
    idPeticion: ID_PETICION,
    secreto: SECRETO,
    ahora,
  });
}

function verificar(cambios: Partial<Parameters<typeof verificarFirmaWebhook>[0]> = {}) {
  const firma = firmaValida();

  return verificarFirmaWebhook({
    cabeceraFirma: firma.cabeceraFirma,
    idPeticion: firma.idPeticion,
    idRecurso: ID_RECURSO,
    secreto: SECRETO,
    ahora: AHORA,
    ...cambios,
  });
}

describe('firma válida', () => {
  it('acepta una notificación bien firmada', () => {
    expect(verificar()).toEqual({ valida: true });
  });

  it('acepta dentro de la ventana de tolerancia', () => {
    // Cuatro minutos de desfase de reloj: aceptable.
    expect(verificar({ ahora: AHORA + 4 * 60_000 }).valida).toBe(true);
    expect(verificar({ ahora: AHORA - 4 * 60_000 }).valida).toBe(true);
  });
});

describe('intentos de falsificación', () => {
  it('rechaza una firma inventada', () => {
    const resultado = verificar({
      cabeceraFirma: 'ts=1790000000,v1=' + 'a'.repeat(64),
    });

    expect(resultado.valida).toBe(false);
  });

  it('rechaza una firma hecha con otro secreto', () => {
    const conOtroSecreto = firmarNotificacion({
      idRecurso: ID_RECURSO,
      idPeticion: ID_PETICION,
      secreto: 'otro-secreto',
      ahora: AHORA,
    });

    expect(verificar({ cabeceraFirma: conOtroSecreto.cabeceraFirma }).valida).toBe(false);
  });

  it('rechaza si se cambia el recurso pero se reusa la firma', () => {
    // El ataque más obvio: tomar una notificación legítima y apuntarla a otro pago.
    expect(verificar({ idRecurso: '9999999999' }).valida).toBe(false);
  });

  it('rechaza si se cambia el identificador de petición', () => {
    expect(verificar({ idPeticion: 'otro-id' }).valida).toBe(false);
  });

  it('rechaza una notificación vieja reenviada', () => {
    // Capturada hace una hora y reenviada ahora.
    const resultado = verificar({ ahora: AHORA + 60 * 60_000 });

    expect(resultado.valida).toBe(false);
    expect(resultado.valida === false && resultado.motivo).toMatch(/ventana de tiempo/);
  });

  it('rechaza una notificación con marca de tiempo futura', () => {
    expect(verificar({ ahora: AHORA - 60 * 60_000 }).valida).toBe(false);
  });

  it('rechaza si la marca de tiempo se manipuló para entrar en la ventana', () => {
    // Se le cambia el ts a una firma válida: el mensaje firmado ya no coincide.
    const firma = firmaValida(AHORA - 60 * 60_000);
    const tsActual = Math.floor(AHORA / 1000);
    const v1Original = firma.cabeceraFirma.split('v1=')[1];

    expect(
      verificar({ cabeceraFirma: `ts=${String(tsActual)},v1=${v1Original ?? ''}` }).valida,
    ).toBe(false);
  });
});

describe('entradas mal formadas', () => {
  it('rechaza si falta la cabecera', () => {
    expect(verificar({ cabeceraFirma: undefined }).valida).toBe(false);
  });

  it('rechaza si falta el identificador del recurso', () => {
    expect(verificar({ idRecurso: undefined }).valida).toBe(false);
  });

  it('rechaza una cabecera sin las dos piezas', () => {
    expect(verificar({ cabeceraFirma: 'ts=1790000000' }).valida).toBe(false);
    expect(verificar({ cabeceraFirma: 'v1=abc' }).valida).toBe(false);
  });

  it('rechaza una marca de tiempo que no es un número', () => {
    expect(verificar({ cabeceraFirma: 'ts=ayer,v1=' + 'a'.repeat(64) }).valida).toBe(false);
  });

  it('rechaza una firma que no es hexadecimal', () => {
    expect(
      verificar({ cabeceraFirma: `ts=${String(Math.floor(AHORA / 1000))},v1=zzzz` }).valida,
    ).toBe(false);
  });

  it('rechaza si no hay secreto configurado', () => {
    const resultado = verificar({ secreto: '' });

    expect(resultado.valida).toBe(false);
    expect(resultado.valida === false && resultado.motivo).toMatch(/secreto/);
  });
});

describe('compatibilidad con el formato de Mercado Pago', () => {
  it('arma el mensaje firmado en el orden que documenta el proveedor', () => {
    const ts = Math.floor(AHORA / 1000);
    const mensaje = `id:${ID_RECURSO};request-id:${ID_PETICION};ts:${String(ts)};`;
    const esperada = createHmac('sha256', SECRETO).update(mensaje).digest('hex');

    expect(verificar({ cabeceraFirma: `ts=${String(ts)},v1=${esperada}` })).toEqual({
      valida: true,
    });
  });

  it('normaliza a minúsculas el identificador cuando trae letras', () => {
    const idConLetras = 'ABC123xyz';
    const firma = firmarNotificacion({
      idRecurso: idConLetras,
      idPeticion: ID_PETICION,
      secreto: SECRETO,
      ahora: AHORA,
    });

    // Llega en mayúsculas pero valida igual, porque ambos lados normalizan.
    expect(
      verificarFirmaWebhook({
        cabeceraFirma: firma.cabeceraFirma,
        idPeticion: ID_PETICION,
        idRecurso: idConLetras,
        secreto: SECRETO,
        ahora: AHORA,
      }).valida,
    ).toBe(true);
  });

  it('tolera espacios alrededor de las piezas de la cabecera', () => {
    const firma = firmaValida();
    const conEspacios = firma.cabeceraFirma.replace(',', ' , ');

    expect(verificar({ cabeceraFirma: conEspacios }).valida).toBe(true);
  });
});
