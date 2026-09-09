// Usuarios del panel interno y sus sesiones.
//
// El acceso es por email y contraseña, siempre por invitación de gerencia.
// Ni las contraseñas ni los tokens se guardan en claro: sólo su hash.
import { sql } from 'drizzle-orm';
import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { marcasDeTiempo, rol } from './comunes';

export const usuarios = pgTable(
  'usuarios',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    email: text('email').notNull(),
    nombre: text('nombre').notNull(),
    rol: rol('rol').notNull(),
    /** Hash Argon2id. Queda en null hasta que la persona acepta la invitación. */
    hashContrasenia: text('hash_contrasenia'),
    /** Hash del token de invitación o de recuperación vigente. */
    hashTokenAcceso: text('hash_token_acceso'),
    tokenAccesoExpiraEn: timestamp('token_acceso_expira_en', { withTimezone: true }),
    activo: boolean('activo').notNull().default(true),
    ...marcasDeTiempo,
  },
  (tabla) => [
    // El email identifica al usuario sin importar cómo lo haya tipeado.
    uniqueIndex('usuarios_email_unico').on(sql`lower(${tabla.email})`),
  ],
);

export const sesiones = pgTable(
  'sesiones',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    /** Hash del token de sesión que viaja en la cookie httpOnly. */
    hashToken: text('hash_token').notNull(),
    expiraEn: timestamp('expira_en', { withTimezone: true }).notNull(),
    ultimoUsoEn: timestamp('ultimo_uso_en', { withTimezone: true }),
    agenteUsuario: text('agente_usuario'),
    creadoEn: timestamp('creado_en', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (tabla) => [uniqueIndex('sesiones_hash_token_unico').on(tabla.hashToken)],
);
