// Acceso al panel.
//
// Cuatro decisiones que gobiernan este módulo:
//
//   1. **Nunca se dice si un email existe.** Ni al entrar ni al recuperar la
//      contraseña. Averiguar qué direcciones tienen cuenta es el primer paso
//      de cualquier ataque dirigido.
//   2. **Las contraseñas van con Argon2id**, que es lento a propósito. Los
//      tokens van hasheados con SHA-256: son 32 bytes aleatorios y no hay
//      diccionario que valga.
//   3. **Los enlaces sirven una sola vez.** Aceptar una invitación o cambiar la
//      contraseña consume el token.
//   4. **Cambiar la contraseña cierra las demás sesiones.** Si alguien la
//      cambió porque sospecha que se la robaron, dejar viva la sesión del
//      intruso no serviría de nada.
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import { Algorithm, hash, verify } from '@node-rs/argon2';
import {
  buscarPorTokenAcceso,
  buscarUsuarioPorEmail,
  cerrarSesion,
  cerrarSesionesDeUsuario,
  crearSesion,
  crearUsuarioInvitado,
  emitirTokenAcceso,
  fijarContrasenia,
  generarTokenGestion,
  usuarioDeSesion,
  type BaseDatos,
  type UsuarioDelPanel,
} from '@manly/base-datos';
import type { Invitacion, UsuarioSesion } from '@manly/contratos';

import { BASE_DATOS } from '../../comun/base-datos/base-datos.modulo';
import type { Entorno } from '../../configuracion/entorno';

/** Duración de una sesión del panel. */
const DIAS_SESION = 14;

/** Cuánto vale un enlace de invitación. */
const DIAS_INVITACION = 7;

/** Cuánto vale un enlace de recuperación. Corto a propósito. */
const HORAS_RECUPERACION = 2;

/**
 * Parámetros de Argon2id.
 *
 * Son los que recomienda OWASP: 19 MiB de memoria, dos pasadas y sin
 * paralelismo. Subirlos endurece el hash pero encarece cada ingreso.
 */
const ARGON = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Hash de descarte, para gastar tiempo cuando el email no existe.
 *
 * Sin esto, un ingreso con email inexistente respondería mucho más rápido que
 * uno con email real, y esa diferencia de tiempo delataría qué direcciones
 * tienen cuenta.
 *
 * Se genera de verdad al arrancar: un valor inventado a mano fallaría el
 * formato y `verify` volvería enseguida, que es justo lo que se quiere evitar.
 */
let hashSenuelo: Promise<string> | null = null;

function obtenerHashSenuelo(): Promise<string> {
  hashSenuelo ??= hash(randomBytes(32).toString('hex'), ARGON);

  return hashSenuelo;
}

export interface SesionCreada {
  token: string;
  expiraEn: Date;
  usuario: UsuarioSesion;
}

@Injectable()
export class AutenticacionServicio {
  private readonly registro = new Logger(AutenticacionServicio.name);

  constructor(
    @Inject(BASE_DATOS) private readonly bd: BaseDatos,
    private readonly configuracion: ConfigService<Entorno, true>,
  ) {}

  /**
   * Valida las credenciales y abre una sesión.
   *
   * El mensaje de error es el mismo pase lo que pase: email inexistente,
   * contraseña incorrecta, invitación sin aceptar o usuario dado de baja.
   */
  async ingresar(
    email: string,
    contrasenia: string,
    agenteUsuario?: string,
  ): Promise<SesionCreada> {
    const usuario = await buscarUsuarioPorEmail(this.bd, email);

    // Se verifica igual contra un hash de descarte para que el tiempo de
    // respuesta no delate si el email existe.
    const hashAComparar = usuario?.hashContrasenia ?? (await obtenerHashSenuelo());
    const coincide = await this.verificarContrasenia(hashAComparar, contrasenia);

    if (!usuario || !usuario.hashContrasenia || !usuario.activo || !coincide) {
      this.registro.warn(`Ingreso fallido para ${email}.`);

      throw new UnauthorizedException('Email o contraseña incorrectos.');
    }

    return this.abrirSesion(usuario, agenteUsuario);
  }

  /** Devuelve el usuario de una sesión, o null si no vale. */
  async usuarioDe(token: string | undefined): Promise<UsuarioSesion | null> {
    if (!token) return null;

    const usuario = await usuarioDeSesion(this.bd, token);

    return usuario ? this.aContrato(usuario) : null;
  }

  async salir(token: string | undefined): Promise<void> {
    if (token) {
      await cerrarSesion(this.bd, token);
    }
  }

  // ── Invitaciones ───────────────────────────────────────────────────────────

  /**
   * Invita a alguien al panel.
   *
   * Devuelve el enlace en claro. Es la única vez que existe: en la base queda
   * sólo su hash. Si la persona ya estaba invitada, se reemplaza el token
   * anterior en vez de crear otro usuario.
   */
  async invitar(datos: Invitacion): Promise<{ url: string; usuarioId: string }> {
    const { token, hash: hashToken } = generarTokenGestion();
    const expiraEn = new Date(Date.now() + DIAS_INVITACION * 24 * 3_600_000);

    const existente = await buscarUsuarioPorEmail(this.bd, datos.email);

    if (existente?.hashContrasenia) {
      throw new UnauthorizedException('Esa persona ya tiene acceso al panel.');
    }

    const usuarioId = existente
      ? (await emitirTokenAcceso(this.bd, existente.id, hashToken, expiraEn), existente.id)
      : await crearUsuarioInvitado(this.bd, { ...datos, hashToken, expiraEn });

    return { url: this.urlDelPanel(`/panel/invitacion/${token}`), usuarioId };
  }

  /** Fija la contraseña de una invitación y deja la sesión abierta. */
  async aceptarInvitacion(
    token: string,
    contrasenia: string,
    agenteUsuario?: string,
  ): Promise<SesionCreada> {
    const usuario = await buscarPorTokenAcceso(this.bd, token);

    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException('Ese enlace no vale o ya venció.');
    }

    await fijarContrasenia(this.bd, usuario.id, await this.hashearContrasenia(contrasenia));

    return this.abrirSesion(usuario, agenteUsuario);
  }

  // ── Recuperación ───────────────────────────────────────────────────────────

  /**
   * Emite un enlace de recuperación.
   *
   * Devuelve null cuando el email no tiene cuenta, pero **quien llama responde
   * lo mismo en los dos casos**: si la respuesta cambiara, serviría para
   * averiguar qué direcciones están registradas.
   */
  async pedirRecuperacion(email: string): Promise<string | null> {
    const usuario = await buscarUsuarioPorEmail(this.bd, email);

    if (!usuario || !usuario.activo) {
      this.registro.warn(`Recuperación pedida para un email sin cuenta: ${email}.`);

      return null;
    }

    const { token, hash: hashToken } = generarTokenGestion();
    const expiraEn = new Date(Date.now() + HORAS_RECUPERACION * 3_600_000);

    await emitirTokenAcceso(this.bd, usuario.id, hashToken, expiraEn);

    return this.urlDelPanel(`/panel/recuperar/${token}`);
  }

  /** Cambia la contraseña con un enlace de recuperación. */
  async cambiarContrasenia(
    token: string,
    contrasenia: string,
    agenteUsuario?: string,
  ): Promise<SesionCreada> {
    const usuario = await buscarPorTokenAcceso(this.bd, token);

    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException('Ese enlace no vale o ya venció.');
    }

    await fijarContrasenia(this.bd, usuario.id, await this.hashearContrasenia(contrasenia));

    // Si la cambió porque se la robaron, dejar viva la sesión del intruso no
    // serviría de nada.
    await cerrarSesionesDeUsuario(this.bd, usuario.id);

    return this.abrirSesion(usuario, agenteUsuario);
  }

  // ── Interno ────────────────────────────────────────────────────────────────

  private async abrirSesion(
    usuario: UsuarioDelPanel,
    agenteUsuario?: string,
  ): Promise<SesionCreada> {
    const { token, hash: hashToken } = generarTokenGestion();
    const expiraEn = new Date(Date.now() + DIAS_SESION * 24 * 3_600_000);

    await crearSesion(this.bd, {
      usuarioId: usuario.id,
      hashToken,
      expiraEn,
      agenteUsuario: agenteUsuario?.slice(0, 300) ?? null,
    });

    return { token, expiraEn, usuario: this.aContrato(usuario) };
  }

  private hashearContrasenia(contrasenia: string): Promise<string> {
    return hash(contrasenia, ARGON);
  }

  private async verificarContrasenia(hashGuardado: string, contrasenia: string): Promise<boolean> {
    try {
      return await verify(hashGuardado, contrasenia, ARGON);
    } catch {
      // Un hash con formato inválido no debe distinguirse de una contraseña
      // equivocada.
      return false;
    }
  }

  private aContrato(usuario: UsuarioDelPanel): UsuarioSesion {
    return {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      profesionalId: usuario.profesionalId,
    };
  }

  private urlDelPanel(ruta: string): string {
    return `${this.configuracion.get('NEXT_PUBLIC_URL_PUBLICA', { infer: true })}${ruta}`;
  }
}
