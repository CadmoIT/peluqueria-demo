// Verifica las reglas que el esquema hace cumplir con restricciones CHECK.
//
// Son invariantes que no dependen de que la aplicación se acuerde: una seña mal
// configurada o una reserva sin dato de contacto no llegan a guardarse.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { crearBaseEfimera, sembrarMinimo, type BaseEfimera, type Semilla } from './base-efimera';

let bd: BaseEfimera;
let semilla: Semilla;

beforeEach(async () => {
  bd = await crearBaseEfimera();
  semilla = await sembrarMinimo(bd);
});

afterEach(async () => {
  await bd.close();
});

describe('reglas de seña', () => {
  it('rechaza una seña fija sin monto', async () => {
    await expect(
      bd.query(
        `INSERT INTO servicios (nombre, duracion_minutos, precio_centavos, modalidad_senia)
         VALUES ('Barba', 30, 800000, 'fija')`,
      ),
    ).rejects.toThrow(/servicios_senia_coherente/);
  });

  it('rechaza una seña porcentual sin porcentaje', async () => {
    await expect(
      bd.query(
        `INSERT INTO servicios (nombre, duracion_minutos, precio_centavos, modalidad_senia)
         VALUES ('Barba', 30, 800000, 'porcentual')`,
      ),
    ).rejects.toThrow(/servicios_senia_coherente/);
  });

  it('rechaza un porcentaje fuera de rango', async () => {
    await expect(
      bd.query(
        `INSERT INTO servicios (nombre, duracion_minutos, precio_centavos, modalidad_senia, senia_porcentaje)
         VALUES ('Barba', 30, 800000, 'porcentual', 150)`,
      ),
    ).rejects.toThrow(/servicios_porcentaje_valido/);
  });

  it('rechaza mezclar monto fijo con porcentaje', async () => {
    await expect(
      bd.query(
        `INSERT INTO servicios (nombre, duracion_minutos, precio_centavos, modalidad_senia, senia_fija_centavos, senia_porcentaje)
         VALUES ('Barba', 30, 800000, 'fija', 100000, 30)`,
      ),
    ).rejects.toThrow(/servicios_senia_coherente/);
  });

  it('acepta una seña porcentual bien formada', async () => {
    await expect(
      bd.query(
        `INSERT INTO servicios (nombre, duracion_minutos, precio_centavos, modalidad_senia, senia_porcentaje)
         VALUES ('Barba', 30, 800000, 'porcentual', 30)`,
      ),
    ).resolves.toBeDefined();
  });

  it('rechaza una duración de cero minutos', async () => {
    await expect(
      bd.query(
        `INSERT INTO servicios (nombre, duracion_minutos, precio_centavos) VALUES ('Nada', 0, 0)`,
      ),
    ).rejects.toThrow(/servicios_duracion_positiva/);
  });
});

describe('contacto de la reserva', () => {
  async function insertarReserva(canal: string, whatsapp: string | null, email: string | null) {
    return bd.query(
      `INSERT INTO reservas (
         sucursal_id, cliente_nombre, canal_contacto, contacto_whatsapp, contacto_email,
         comienza_en, termina_en, precio_total_centavos, hash_token_gestion, acepto_condiciones_en
       ) VALUES ($1, 'Cliente', $2, $3, $4,
         '2026-10-01T13:00:00Z', '2026-10-01T14:00:00Z', 1500000, 'hash', now())`,
      [semilla.sucursalId, canal, whatsapp, email],
    );
  }

  it('rechaza el canal whatsapp sin número', async () => {
    await expect(insertarReserva('whatsapp', null, 'a@b.com')).rejects.toThrow(
      /reservas_contacto_coherente/,
    );
  });

  it('rechaza el canal email sin dirección', async () => {
    await expect(insertarReserva('email', '5491100000000', null)).rejects.toThrow(
      /reservas_contacto_coherente/,
    );
  });

  it('acepta el canal declarado con su dato cargado', async () => {
    await expect(insertarReserva('whatsapp', '5491100000000', null)).resolves.toBeDefined();
  });

  it('rechaza una seña mayor que el precio total', async () => {
    await expect(
      bd.query(
        `INSERT INTO reservas (
           sucursal_id, cliente_nombre, canal_contacto, contacto_whatsapp,
           comienza_en, termina_en, precio_total_centavos, senia_total_centavos,
           hash_token_gestion, acepto_condiciones_en
         ) VALUES ($1, 'Cliente', 'whatsapp', '5491100000000',
           '2026-10-01T13:00:00Z', '2026-10-01T14:00:00Z', 100000, 200000, 'hash', now())`,
        [semilla.sucursalId],
      ),
    ).rejects.toThrow(/reservas_senia_no_supera_precio/);
  });

  it('rechaza una ventana que termina antes de empezar', async () => {
    await expect(
      bd.query(
        `INSERT INTO reservas (
           sucursal_id, cliente_nombre, canal_contacto, contacto_whatsapp,
           comienza_en, termina_en, precio_total_centavos, hash_token_gestion, acepto_condiciones_en
         ) VALUES ($1, 'Cliente', 'whatsapp', '5491100000000',
           '2026-10-01T14:00:00Z', '2026-10-01T13:00:00Z', 100000, 'hash', now())`,
        [semilla.sucursalId],
      ),
    ).rejects.toThrow(/reservas_rango_valido/);
  });
});

describe('horarios y excepciones', () => {
  it('rechaza un día de semana fuera de 0 a 6', async () => {
    await expect(
      bd.query(
        `INSERT INTO horarios_semanales (profesional_id, sucursal_id, dia_semana, comienza, termina)
         VALUES ($1, $2, 7, '09:00', '18:00')`,
        [semilla.profesionalId, semilla.sucursalId],
      ),
    ).rejects.toThrow(/horarios_dia_semana_valido/);
  });

  it('rechaza un horario que termina antes de empezar', async () => {
    await expect(
      bd.query(
        `INSERT INTO horarios_semanales (profesional_id, sucursal_id, dia_semana, comienza, termina)
         VALUES ($1, $2, 1, '18:00', '09:00')`,
        [semilla.profesionalId, semilla.sucursalId],
      ),
    ).rejects.toThrow(/horarios_rango_valido/);
  });

  it('rechaza una excepción que no alcanza ni a un profesional ni a una sucursal', async () => {
    await expect(
      bd.query(
        `INSERT INTO excepciones_horario (tipo, comienza_en, termina_en)
         VALUES ('feriado', '2026-12-25T00:00:00Z', '2026-12-26T00:00:00Z')`,
      ),
    ).rejects.toThrow(/excepciones_alcance_definido/);
  });

  it('acepta un feriado que alcanza a toda una sucursal', async () => {
    await expect(
      bd.query(
        `INSERT INTO excepciones_horario (sucursal_id, tipo, comienza_en, termina_en)
         VALUES ($1, 'feriado', '2026-12-25T00:00:00Z', '2026-12-26T00:00:00Z')`,
        [semilla.sucursalId],
      ),
    ).resolves.toBeDefined();
  });
});

describe('configuración del negocio', () => {
  it('arranca vacía y admite una única fila', async () => {
    await bd.query(`INSERT INTO configuracion_negocio DEFAULT VALUES`);

    await expect(bd.query(`INSERT INTO configuracion_negocio DEFAULT VALUES`)).rejects.toThrow(
      /configuracion_negocio_fila_unica_unico|unique/i,
    );
  });

  it('trae los valores por defecto del plan', async () => {
    await bd.query(`INSERT INTO configuracion_negocio DEFAULT VALUES`);

    const fila = await bd.query<{
      horas_minimas_cancelacion: number;
      minutos_retencion: number;
      dias_horizonte: number;
      maximo_servicios_por_reserva: number;
      zona_horaria: string;
    }>(`SELECT * FROM configuracion_negocio`);

    expect(fila.rows[0]).toMatchObject({
      horas_minimas_cancelacion: 24,
      minutos_retencion: 10,
      dias_horizonte: 60,
      maximo_servicios_por_reserva: 4,
      zona_horaria: 'America/Argentina/Buenos_Aires',
    });
  });
});

describe('idempotencia de pagos', () => {
  it('no admite dos pagos con el mismo identificador externo', async () => {
    const reserva = await bd.query<{ id: string }>(
      `INSERT INTO reservas (
         sucursal_id, cliente_nombre, canal_contacto, contacto_whatsapp,
         comienza_en, termina_en, precio_total_centavos, hash_token_gestion, acepto_condiciones_en
       ) VALUES ($1, 'Cliente', 'whatsapp', '5491100000000',
         '2026-10-01T13:00:00Z', '2026-10-01T14:00:00Z', 1500000, 'hash', now())
       RETURNING id`,
      [semilla.sucursalId],
    );

    const reservaId = reserva.rows[0]!.id;

    await bd.query(
      `INSERT INTO pagos (reserva_id, tipo, medio, monto_centavos, id_pago_externo)
       VALUES ($1, 'senia', 'mercado_pago', 500000, 'mp-123')`,
      [reservaId],
    );

    // El webhook de Mercado Pago puede llegar repetido: la base lo frena.
    await expect(
      bd.query(
        `INSERT INTO pagos (reserva_id, tipo, medio, monto_centavos, id_pago_externo)
         VALUES ($1, 'senia', 'mercado_pago', 500000, 'mp-123')`,
        [reservaId],
      ),
    ).rejects.toThrow(/pagos_id_externo_unico|unique/i);
  });

  it('admite varios pagos sin identificador externo', async () => {
    const reserva = await bd.query<{ id: string }>(
      `INSERT INTO reservas (
         sucursal_id, cliente_nombre, canal_contacto, contacto_whatsapp,
         comienza_en, termina_en, precio_total_centavos, hash_token_gestion, acepto_condiciones_en
       ) VALUES ($1, 'Cliente', 'whatsapp', '5491100000000',
         '2026-10-01T13:00:00Z', '2026-10-01T14:00:00Z', 1500000, 'hash2', now())
       RETURNING id`,
      [semilla.sucursalId],
    );

    const reservaId = reserva.rows[0]!.id;

    // Dos cobros presenciales del mismo saldo son legítimos y no tienen id externo.
    await bd.query(
      `INSERT INTO pagos (reserva_id, tipo, medio, monto_centavos)
       VALUES ($1, 'saldo', 'efectivo', 500000)`,
      [reservaId],
    );

    await expect(
      bd.query(
        `INSERT INTO pagos (reserva_id, tipo, medio, monto_centavos)
         VALUES ($1, 'saldo', 'efectivo', 500000)`,
        [reservaId],
      ),
    ).resolves.toBeDefined();
  });
});
