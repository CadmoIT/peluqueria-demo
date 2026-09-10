// Contratos de acceso al panel.
//
// No hay registro público: se entra sólo por invitación de gerencia. Quien
// invita elige el rol, y la persona invitada define su contraseña al aceptar.
import { z } from 'zod';

import { esquemaId, esquemaRol } from './comunes';

/**
 * Contraseña.
 *
 * El mínimo es de largo y no de composición: exigir mayúsculas y símbolos
 * empuja a la gente a `Manly2024!` en vez de a una frase larga, que es más
 * difícil de adivinar. El tope evita que un texto enorme haga trabajar de más
 * al hash.
 */
export const esquemaContrasenia = z
  .string()
  .min(10, 'Usá al menos 10 caracteres. Una frase que recuerdes sirve.')
  .max(200);

export const esquemaIngreso = z.object({
  email: z.string().trim().email('Revisá la dirección de correo.'),
  contrasenia: z.string().min(1, 'Escribí tu contraseña.'),
});
export type Ingreso = z.infer<typeof esquemaIngreso>;

export const esquemaInvitacion = z.object({
  email: z.string().trim().email('Revisá la dirección de correo.'),
  nombre: z.string().trim().min(2).max(80),
  rol: esquemaRol,
});
export type Invitacion = z.infer<typeof esquemaInvitacion>;

export const esquemaAceptarInvitacion = z.object({
  token: z.string().min(10),
  contrasenia: esquemaContrasenia,
});
export type AceptarInvitacion = z.infer<typeof esquemaAceptarInvitacion>;

export const esquemaPedidoRecuperacion = z.object({
  email: z.string().trim().email('Revisá la dirección de correo.'),
});
export type PedidoRecuperacion = z.infer<typeof esquemaPedidoRecuperacion>;

export const esquemaCambioContrasenia = z.object({
  token: z.string().min(10),
  contrasenia: esquemaContrasenia,
});
export type CambioContrasenia = z.infer<typeof esquemaCambioContrasenia>;

/** Quién está usando el panel. Nunca incluye el hash de la contraseña. */
export const esquemaUsuarioSesion = z.object({
  id: esquemaId,
  nombre: z.string(),
  email: z.string(),
  rol: esquemaRol,
  /** Identificador del profesional asociado, si el usuario es uno. */
  profesionalId: esquemaId.nullable(),
});
export type UsuarioSesion = z.infer<typeof esquemaUsuarioSesion>;
