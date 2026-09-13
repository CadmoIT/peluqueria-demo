// Usuarios del panel y sus sesiones.
//
// Ni las contraseñas ni los tokens se guardan en claro. La contraseña va con
// Argon2id, que está pensado para ser lento a propósito; los tokens de
// invitación, recuperación y sesión van con SHA-256, porque son valores
// aleatorios de 32 bytes y no hay diccionario que valga contra eso.
import { and, eq, gt, isNotNull, lt, sql } from 'drizzle-orm';

import type { BaseDatos } from '../conexion';
import { profesionales, sesiones, usuarios } from '../esquemas/index';
import { hashearToken } from './tokens';

export type Rol = 'gerencia' | 'profesional';

export interface UsuarioDelPanel {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
  /** Null hasta que la persona acepta la invitación y define su contraseña. */
  hashContrasenia: string | null;
  /** Identificador del profesional asociado, si lo hay. */
  profesionalId: string | null;
}

/**
 * Busca por email, sin distinguir mayúsculas.
 *
 * Devuelve también los inactivos: quien llama decide qué hacer con ellos, y
 * así el mensaje de error puede ser el mismo en todos los casos.
 */
export async function buscarUsuarioPorEmail(
  bd: BaseDatos,
  email: string,
): Promise<UsuarioDelPanel | null> {
  const [fila] = await bd
    .select({
      id: usuarios.id,
      email: usuarios.email,
      nombre: usuarios.nombre,
      rol: usuarios.rol,
      activo: usuarios.activo,
      hashContrasenia: usuarios.hashContrasenia,
      profesionalId: profesionales.id,
    })
    .from(usuarios)
    .leftJoin(profesionales, eq(profesionales.usuarioId, usuarios.id))
    .where(sql`lower(${usuarios.email}) = lower(${email})`)
    .limit(1);

  return fila ?? null;
}

/**
 * Crea el usuario invitado, sin contraseña.
 *
 * Queda inutilizable hasta que la persona acepta la invitación: sin hash de
 * contraseña no hay forma de entrar.
 */
export async function crearUsuarioInvitado(
  bd: BaseDatos,
  datos: { email: string; nombre: string; rol: Rol; hashToken: string; expiraEn: Date },
): Promise<string> {
  const [creado] = await bd
    .insert(usuarios)
    .values({
      email: datos.email,
      nombre: datos.nombre,
      rol: datos.rol,
      hashContrasenia: null,
      hashTokenAcceso: datos.hashToken,
      tokenAccesoExpiraEn: datos.expiraEn,
    })
    .returning({ id: usuarios.id });

  if (!creado) {
    throw new Error('No se pudo crear el usuario.');
  }

  return creado.id;
}

/** Vuelve a emitir el token de acceso, para reinvitar o recuperar la contraseña. */
export async function emitirTokenAcceso(
  bd: BaseDatos,
  usuarioId: string,
  hashToken: string,
  expiraEn: Date,
): Promise<void> {
  await bd
    .update(usuarios)
    .set({ hashTokenAcceso: hashToken, tokenAccesoExpiraEn: expiraEn, actualizadoEn: new Date() })
    .where(eq(usuarios.id, usuarioId));
}

/**
 * Busca al usuario por un token de acceso vigente.
 *
 * Comprueba el vencimiento en la misma consulta: un token expirado no debe
 * poder distinguirse de uno inexistente.
 */
export async function buscarPorTokenAcceso(
  bd: BaseDatos,
  token: string,
): Promise<UsuarioDelPanel | null> {
  const [fila] = await bd
    .select({
      id: usuarios.id,
      email: usuarios.email,
      nombre: usuarios.nombre,
      rol: usuarios.rol,
      activo: usuarios.activo,
      hashContrasenia: usuarios.hashContrasenia,
      profesionalId: profesionales.id,
    })
    .from(usuarios)
    .leftJoin(profesionales, eq(profesionales.usuarioId, usuarios.id))
    .where(
      and(
        eq(usuarios.hashTokenAcceso, hashearToken(token)),
        isNotNull(usuarios.tokenAccesoExpiraEn),
        gt(usuarios.tokenAccesoExpiraEn, sql`now()`),
      ),
    )
    .limit(1);

  return fila ?? null;
}

/**
 * Fija la contraseña y consume el token.
 *
 * El token se borra en la misma operación: un enlace de invitación o de
 * recuperación sirve una sola vez.
 */
export async function fijarContrasenia(
  bd: BaseDatos,
  usuarioId: string,
  hashContrasenia: string,
): Promise<void> {
  await bd
    .update(usuarios)
    .set({
      hashContrasenia,
      hashTokenAcceso: null,
      tokenAccesoExpiraEn: null,
      actualizadoEn: new Date(),
    })
    .where(eq(usuarios.id, usuarioId));
}

// ── Sesiones ─────────────────────────────────────────────────────────────────

/** Crea la sesión. Sólo se guarda el hash del token que viaja en la cookie. */
export async function crearSesion(
  bd: BaseDatos,
  datos: { usuarioId: string; hashToken: string; expiraEn: Date; agenteUsuario?: string | null },
): Promise<string> {
  const [creada] = await bd
    .insert(sesiones)
    .values({
      usuarioId: datos.usuarioId,
      hashToken: datos.hashToken,
      expiraEn: datos.expiraEn,
      agenteUsuario: datos.agenteUsuario ?? null,
    })
    .returning({ id: sesiones.id });

  if (!creada) {
    throw new Error('No se pudo crear la sesión.');
  }

  return creada.id;
}

/**
 * Devuelve el usuario de una sesión vigente.
 *
 * Comprueba el vencimiento y que el usuario siga activo: dar de baja a alguien
 * tiene que cortarle el acceso de inmediato, no cuando venza su sesión.
 */
export async function usuarioDeSesion(
  bd: BaseDatos,
  token: string,
): Promise<UsuarioDelPanel | null> {
  const [fila] = await bd
    .select({
      id: usuarios.id,
      email: usuarios.email,
      nombre: usuarios.nombre,
      rol: usuarios.rol,
      activo: usuarios.activo,
      hashContrasenia: usuarios.hashContrasenia,
      profesionalId: profesionales.id,
    })
    .from(sesiones)
    .innerJoin(usuarios, eq(usuarios.id, sesiones.usuarioId))
    .leftJoin(profesionales, eq(profesionales.usuarioId, usuarios.id))
    .where(
      and(
        eq(sesiones.hashToken, hashearToken(token)),
        gt(sesiones.expiraEn, sql`now()`),
        eq(usuarios.activo, true),
      ),
    )
    .limit(1);

  if (fila) {
    // Sirve para poder cerrar sesiones abandonadas y para auditar.
    await bd
      .update(sesiones)
      .set({ ultimoUsoEn: new Date() })
      .where(eq(sesiones.hashToken, hashearToken(token)));
  }

  return fila ?? null;
}

export async function cerrarSesion(bd: BaseDatos, token: string): Promise<void> {
  await bd.delete(sesiones).where(eq(sesiones.hashToken, hashearToken(token)));
}

/** Cierra todas las sesiones de un usuario, por ejemplo al cambiar su contraseña. */
export async function cerrarSesionesDeUsuario(bd: BaseDatos, usuarioId: string): Promise<number> {
  const cerradas = await bd
    .delete(sesiones)
    .where(eq(sesiones.usuarioId, usuarioId))
    .returning({ id: sesiones.id });

  return cerradas.length;
}

/** Borra las sesiones vencidas. Lo corre el worker. */
export async function limpiarSesionesVencidas(bd: BaseDatos): Promise<number> {
  const borradas = await bd
    .delete(sesiones)
    .where(lt(sesiones.expiraEn, sql`now()`))
    .returning({ id: sesiones.id });

  return borradas.length;
}

/** Usuarios del panel, para la administración de accesos. */
export async function listarUsuarios(bd: BaseDatos): Promise<UsuarioDelPanel[]> {
  return bd
    .select({
      id: usuarios.id,
      email: usuarios.email,
      nombre: usuarios.nombre,
      rol: usuarios.rol,
      activo: usuarios.activo,
      hashContrasenia: usuarios.hashContrasenia,
      profesionalId: profesionales.id,
    })
    .from(usuarios)
    .leftJoin(profesionales, eq(profesionales.usuarioId, usuarios.id))
    .orderBy(usuarios.nombre);
}

/** Da de alta o de baja a un usuario sin borrarlo. */
export async function cambiarActivo(
  bd: BaseDatos,
  usuarioId: string,
  activo: boolean,
): Promise<void> {
  await bd
    .update(usuarios)
    .set({ activo, actualizadoEn: new Date() })
    .where(eq(usuarios.id, usuarioId));

  // Dar de baja corta el acceso ya mismo.
  if (!activo) {
    await cerrarSesionesDeUsuario(bd, usuarioId);
  }
}
