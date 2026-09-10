// Pruebas de acceso al panel.
//
// Es el módulo más sensible del sistema: quien entra acá ve la agenda de todos,
// los datos de los clientes y el dinero. Las pruebas se concentran en lo que un
// atacante intentaría, no en el camino feliz.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CARPETA_MIGRACIONES,
  SEPARADOR_SENTENCIAS,
  cambiarActivo,
  type BaseDatos,
} from '@manly/base-datos';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AutenticacionServicio } from './autenticacion.servicio';

const CONTRASENIA = 'una-frase-larga-y-facil';

function configuracionFalsa() {
  const valores: Record<string, string> = {
    NEXT_PUBLIC_URL_PUBLICA: 'http://localhost:3000',
    NODE_ENV: 'test',
  };

  return { get: (clave: string) => valores[clave] };
}

interface Contexto {
  cerrar: () => Promise<void>;
  ejecutar: (sql: string, parametros?: unknown[]) => Promise<{ rows: Record<string, string>[] }>;
  bd: BaseDatos;
  autenticacion: AutenticacionServicio;
}

async function montar(): Promise<Contexto> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { btree_gist } = await import('@electric-sql/pglite/contrib/btree_gist');

  const cliente = new PGlite({ extensions: { btree_gist } });

  for (const archivo of readdirSync(CARPETA_MIGRACIONES)
    .filter((nombre) => nombre.endsWith('.sql'))
    .sort()) {
    for (const sentencia of readFileSync(join(CARPETA_MIGRACIONES, archivo), 'utf8')
      .split(SEPARADOR_SENTENCIAS)
      .map((trozo) => trozo.trim())
      .filter(Boolean)) {
      await cliente.exec(sentencia);
    }
  }

  const bd = drizzle(cliente as never) as unknown as BaseDatos;

  return {
    cerrar: () => cliente.close(),
    ejecutar: async (sql, parametros = []) =>
      cliente.query<Record<string, string>>(sql, parametros),
    bd,
    autenticacion: new AutenticacionServicio(bd, configuracionFalsa() as never),
  };
}

let contexto: Contexto;

beforeEach(async () => {
  contexto = await montar();
});

afterEach(async () => {
  await contexto.cerrar();
});

/** Extrae el token de un enlace de invitación o recuperación. */
function tokenDe(url: string): string {
  return url.split('/').pop() ?? '';
}

/** Deja a alguien con acceso listo para usar. */
async function usuarioConAcceso(
  email = 'gerencia@manly.ar',
  rol: 'gerencia' | 'profesional' = 'gerencia',
): Promise<string> {
  const { url } = await contexto.autenticacion.invitar({ email, nombre: 'Gerencia', rol });

  await contexto.autenticacion.aceptarInvitacion(tokenDe(url), CONTRASENIA);

  return email;
}

describe('invitaciones', () => {
  it('crea el usuario sin contraseña, o sea inutilizable hasta que la acepta', async () => {
    await contexto.autenticacion.invitar({
      email: 'nuevo@manly.ar',
      nombre: 'Nuevo',
      rol: 'profesional',
    });

    const fila = await contexto.ejecutar(
      `SELECT hash_contrasenia, hash_token_acceso FROM usuarios WHERE email = 'nuevo@manly.ar'`,
    );

    expect(fila.rows[0]?.hash_contrasenia).toBeNull();
    expect(fila.rows[0]?.hash_token_acceso).toMatch(/^[0-9a-f]{64}$/);
  });

  it('guarda sólo el hash del token, nunca el enlace en claro', async () => {
    const { url } = await contexto.autenticacion.invitar({
      email: 'nuevo@manly.ar',
      nombre: 'Nuevo',
      rol: 'profesional',
    });

    const fila = await contexto.ejecutar(`SELECT hash_token_acceso FROM usuarios LIMIT 1`);

    expect(fila.rows[0]?.hash_token_acceso).not.toBe(tokenDe(url));
  });

  it('al aceptar deja la sesión abierta', async () => {
    const { url } = await contexto.autenticacion.invitar({
      email: 'nuevo@manly.ar',
      nombre: 'Nuevo',
      rol: 'profesional',
    });

    const sesion = await contexto.autenticacion.aceptarInvitacion(tokenDe(url), CONTRASENIA);

    expect(sesion.usuario.rol).toBe('profesional');
    expect(await contexto.autenticacion.usuarioDe(sesion.token)).not.toBeNull();
  });

  it('el enlace sirve una sola vez', async () => {
    const { url } = await contexto.autenticacion.invitar({
      email: 'nuevo@manly.ar',
      nombre: 'Nuevo',
      rol: 'profesional',
    });
    const token = tokenDe(url);

    await contexto.autenticacion.aceptarInvitacion(token, CONTRASENIA);

    await expect(
      contexto.autenticacion.aceptarInvitacion(token, 'otra-frase-larga-distinta'),
    ).rejects.toThrow(/no vale o ya venció/);
  });

  it('un enlace vencido no sirve', async () => {
    const { url } = await contexto.autenticacion.invitar({
      email: 'nuevo@manly.ar',
      nombre: 'Nuevo',
      rol: 'profesional',
    });

    await contexto.ejecutar(
      `UPDATE usuarios SET token_acceso_expira_en = now() - interval '1 hour'`,
    );

    await expect(
      contexto.autenticacion.aceptarInvitacion(tokenDe(url), CONTRASENIA),
    ).rejects.toThrow(/no vale o ya venció/);
  });

  it('un token inventado no sirve', async () => {
    await expect(
      contexto.autenticacion.aceptarInvitacion('token-inventado', CONTRASENIA),
    ).rejects.toThrow(/no vale o ya venció/);
  });

  it('no se puede invitar a alguien que ya tiene acceso', async () => {
    const email = await usuarioConAcceso();

    await expect(
      contexto.autenticacion.invitar({ email, nombre: 'Otra vez', rol: 'gerencia' }),
    ).rejects.toThrow(/ya tiene acceso/);
  });

  it('reinvitar a quien no aceptó reemplaza el token anterior', async () => {
    const primera = await contexto.autenticacion.invitar({
      email: 'nuevo@manly.ar',
      nombre: 'Nuevo',
      rol: 'profesional',
    });
    const segunda = await contexto.autenticacion.invitar({
      email: 'nuevo@manly.ar',
      nombre: 'Nuevo',
      rol: 'profesional',
    });

    // El primero deja de valer; el segundo entra.
    await expect(
      contexto.autenticacion.aceptarInvitacion(tokenDe(primera.url), CONTRASENIA),
    ).rejects.toThrow();

    await expect(
      contexto.autenticacion.aceptarInvitacion(tokenDe(segunda.url), CONTRASENIA),
    ).resolves.toBeDefined();

    const total = await contexto.ejecutar(`SELECT count(*)::text AS total FROM usuarios`);
    expect(total.rows[0]?.total).toBe('1');
  });
});

describe('contraseñas', () => {
  it('se guardan con Argon2id, no en claro', async () => {
    await usuarioConAcceso();

    const fila = await contexto.ejecutar(`SELECT hash_contrasenia FROM usuarios LIMIT 1`);
    const guardado = fila.rows[0]?.hash_contrasenia ?? '';

    expect(guardado).not.toContain(CONTRASENIA);
    expect(guardado).toMatch(/^\$argon2id\$/);
  });

  it('dos personas con la misma contraseña tienen hashes distintos', async () => {
    await usuarioConAcceso('uno@manly.ar');
    await usuarioConAcceso('dos@manly.ar');

    const filas = await contexto.ejecutar(`SELECT hash_contrasenia FROM usuarios`);
    const hashes = filas.rows.map((fila) => fila.hash_contrasenia);

    // La sal hace que sean distintos: un hash filtrado no delata a los demás.
    expect(hashes[0]).not.toBe(hashes[1]);
  });
});

describe('ingreso', () => {
  it('entra con las credenciales correctas', async () => {
    const email = await usuarioConAcceso();

    const sesion = await contexto.autenticacion.ingresar(email, CONTRASENIA);

    expect(sesion.usuario.email).toBe(email);
    expect(sesion.token).toHaveLength(43);
  });

  it('no distingue mayúsculas en el email', async () => {
    await usuarioConAcceso('gerencia@manly.ar');

    await expect(
      contexto.autenticacion.ingresar('GERENCIA@MANLY.AR', CONTRASENIA),
    ).resolves.toBeDefined();
  });

  it('rechaza la contraseña incorrecta', async () => {
    const email = await usuarioConAcceso();

    await expect(contexto.autenticacion.ingresar(email, 'otra-cosa')).rejects.toThrow(
      /incorrectos/,
    );
  });

  it('no revela si el email existe', async () => {
    const email = await usuarioConAcceso();

    const conCuenta = await contexto.autenticacion
      .ingresar(email, 'contrasenia-equivocada')
      .catch((error: Error) => error.message);

    const sinCuenta = await contexto.autenticacion
      .ingresar('nadie@manly.ar', 'contrasenia-equivocada')
      .catch((error: Error) => error.message);

    // El mismo mensaje en los dos casos: si difiriera, serviría para averiguar
    // qué direcciones tienen cuenta.
    expect(conCuenta).toBe(sinCuenta);
  });

  it('una invitación sin aceptar no permite entrar', async () => {
    await contexto.autenticacion.invitar({
      email: 'nuevo@manly.ar',
      nombre: 'Nuevo',
      rol: 'profesional',
    });

    await expect(contexto.autenticacion.ingresar('nuevo@manly.ar', CONTRASENIA)).rejects.toThrow(
      /incorrectos/,
    );
  });

  it('un usuario dado de baja no puede entrar', async () => {
    const email = await usuarioConAcceso();
    const fila = await contexto.ejecutar(`SELECT id FROM usuarios LIMIT 1`);

    await cambiarActivo(contexto.bd, fila.rows[0]?.id ?? '', false);

    await expect(contexto.autenticacion.ingresar(email, CONTRASENIA)).rejects.toThrow(
      /incorrectos/,
    );
  });
});

describe('sesiones', () => {
  it('guarda sólo el hash del token de sesión', async () => {
    const email = await usuarioConAcceso();
    const sesion = await contexto.autenticacion.ingresar(email, CONTRASENIA);

    const fila = await contexto.ejecutar(`SELECT hash_token FROM sesiones LIMIT 1`);

    expect(fila.rows[0]?.hash_token).not.toBe(sesion.token);
    expect(fila.rows[0]?.hash_token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('un token inventado no resuelve a ningún usuario', async () => {
    expect(await contexto.autenticacion.usuarioDe('token-inventado')).toBeNull();
  });

  it('sin token no hay usuario', async () => {
    expect(await contexto.autenticacion.usuarioDe(undefined)).toBeNull();
  });

  it('cerrar sesión invalida el token', async () => {
    const email = await usuarioConAcceso();
    const sesion = await contexto.autenticacion.ingresar(email, CONTRASENIA);

    await contexto.autenticacion.salir(sesion.token);

    expect(await contexto.autenticacion.usuarioDe(sesion.token)).toBeNull();
  });

  it('una sesión vencida no vale', async () => {
    const email = await usuarioConAcceso();
    const sesion = await contexto.autenticacion.ingresar(email, CONTRASENIA);

    await contexto.ejecutar(`UPDATE sesiones SET expira_en = now() - interval '1 minute'`);

    expect(await contexto.autenticacion.usuarioDe(sesion.token)).toBeNull();
  });

  it('dar de baja a alguien le corta el acceso de inmediato', async () => {
    const email = await usuarioConAcceso();
    const sesion = await contexto.autenticacion.ingresar(email, CONTRASENIA);
    const fila = await contexto.ejecutar(`SELECT id FROM usuarios LIMIT 1`);

    await cambiarActivo(contexto.bd, fila.rows[0]?.id ?? '', false);

    // No hay que esperar a que venza la sesión.
    expect(await contexto.autenticacion.usuarioDe(sesion.token)).toBeNull();
  });
});

describe('recuperación de contraseña', () => {
  it('emite un enlace para una cuenta que existe', async () => {
    const email = await usuarioConAcceso();

    const url = await contexto.autenticacion.pedirRecuperacion(email);

    expect(url).toContain('/panel/recuperar/');
  });

  it('no emite nada para un email sin cuenta', async () => {
    expect(await contexto.autenticacion.pedirRecuperacion('nadie@manly.ar')).toBeNull();
  });

  it('cambia la contraseña y deja entrar con la nueva', async () => {
    const email = await usuarioConAcceso();
    const url = await contexto.autenticacion.pedirRecuperacion(email);

    await contexto.autenticacion.cambiarContrasenia(tokenDe(url ?? ''), 'otra-frase-bien-larga');

    await expect(
      contexto.autenticacion.ingresar(email, 'otra-frase-bien-larga'),
    ).resolves.toBeDefined();
    await expect(contexto.autenticacion.ingresar(email, CONTRASENIA)).rejects.toThrow();
  });

  it('cambiar la contraseña cierra las demás sesiones', async () => {
    const email = await usuarioConAcceso();
    const vieja = await contexto.autenticacion.ingresar(email, CONTRASENIA);

    const url = await contexto.autenticacion.pedirRecuperacion(email);
    await contexto.autenticacion.cambiarContrasenia(tokenDe(url ?? ''), 'otra-frase-bien-larga');

    // Si la cambió porque se la robaron, dejar viva la sesión del intruso no
    // serviría de nada.
    expect(await contexto.autenticacion.usuarioDe(vieja.token)).toBeNull();
  });

  it('el enlace de recuperación sirve una sola vez', async () => {
    const email = await usuarioConAcceso();
    const url = await contexto.autenticacion.pedirRecuperacion(email);
    const token = tokenDe(url ?? '');

    await contexto.autenticacion.cambiarContrasenia(token, 'otra-frase-bien-larga');

    await expect(
      contexto.autenticacion.cambiarContrasenia(token, 'una-tercera-frase-larga'),
    ).rejects.toThrow(/no vale o ya venció/);
  });

  it('un enlace de recuperación vencido no sirve', async () => {
    const email = await usuarioConAcceso();
    const url = await contexto.autenticacion.pedirRecuperacion(email);

    await contexto.ejecutar(
      `UPDATE usuarios SET token_acceso_expira_en = now() - interval '1 minute'`,
    );

    await expect(
      contexto.autenticacion.cambiarContrasenia(tokenDe(url ?? ''), 'otra-frase-bien-larga'),
    ).rejects.toThrow(/no vale o ya venció/);
  });
});
