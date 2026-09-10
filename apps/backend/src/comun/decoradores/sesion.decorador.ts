// Decoradores de sesión.
//
// Marcan qué rutas necesitan sesión y con qué rol, y dan acceso al usuario
// autenticado sin tener que hurgar en la petición desde cada controlador.
import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Rol, UsuarioSesion } from '@manly/contratos';

/** Marca una ruta como pública dentro de un controlador protegido. */
export const SIN_SESION = 'sin_sesion';
export const SinSesion = () => SetMetadata(SIN_SESION, true);

/**
 * Roles que pueden usar la ruta.
 *
 * Sin este decorador, una ruta con sesión la puede usar cualquier rol. Las
 * que son sólo de gerencia tienen que decirlo explícitamente.
 */
export const ROLES = 'roles';
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES, roles);

/** El usuario de la sesión, ya resuelto por el guardián. */
export const Usuario = createParamDecorator(
  (_datos: unknown, contexto: ExecutionContext): UsuarioSesion => {
    const peticion = contexto.switchToHttp().getRequest<Request & { usuario?: UsuarioSesion }>();

    if (!peticion.usuario) {
      throw new Error('No hay usuario en la petición: falta el guardián de sesión.');
    }

    return peticion.usuario;
  },
);
