// Tokens de gestión de reservas.
//
// El cliente gestiona su turno con un enlace privado, sin cuenta ni contraseña.
// Ese enlace lleva un token que hace de credencial, así que se trata como tal:
// en la base queda sólo el hash, y el valor en claro se devuelve una única vez,
// al crearlo. Si alguien accede a la base, no puede entrar a ninguna reserva.
import { createHash, randomBytes } from 'node:crypto';

/** 32 bytes de entropía: imposible de adivinar por fuerza bruta. */
const BYTES_TOKEN = 32;

/** Genera un token nuevo y su hash. El claro se muestra una sola vez. */
export function generarTokenGestion(): { token: string; hash: string } {
  const token = randomBytes(BYTES_TOKEN).toString('base64url');

  return { token, hash: hashearToken(token) };
}

/**
 * Hash del token para guardar y para buscar.
 *
 * SHA-256 sin sal a propósito: hace falta poder buscar la reserva por el hash
 * en una sola consulta, y con 32 bytes de entropía no hay diccionario posible
 * que valga la pena. Para contraseñas de personas, en cambio, se usa Argon2id.
 */
export function hashearToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
