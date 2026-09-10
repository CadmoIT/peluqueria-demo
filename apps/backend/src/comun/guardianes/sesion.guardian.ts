// Guardián de sesión y roles.
//
// Resuelve la cookie a un usuario y comprueba el rol. Va como guardián global
// del panel, con lo cual **una ruta nueva queda protegida por omisión**: hay
// que marcarla con `@SinSesion()` para abrirla. Al revés —proteger a mano cada
// ruta— alcanza con olvidarse una vez para filtrar la agenda entera.
import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Rol, UsuarioSesion } from '@manly/contratos';

import { ROLES, SIN_SESION } from '../decoradores/sesion.decorador';
import { AutenticacionServicio } from '../../modulos/autenticacion/autenticacion.servicio';

/** Nombre de la cookie de sesión del panel. */
export const COOKIE_SESION = 'manly_sesion';

@Injectable()
export class SesionGuardian implements CanActivate {
  constructor(
    private readonly autenticacion: AutenticacionServicio,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const esPublica = this.reflector.getAllAndOverride<boolean>(SIN_SESION, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);

    if (esPublica) return true;

    const peticion = contexto
      .switchToHttp()
      .getRequest<Request & { usuario?: UsuarioSesion; cookies?: Record<string, string> }>();

    const usuario = await this.autenticacion.usuarioDe(peticion.cookies?.[COOKIE_SESION]);

    if (!usuario) {
      throw new UnauthorizedException('Necesitás iniciar sesión.');
    }

    peticion.usuario = usuario;

    const roles = this.reflector.getAllAndOverride<Rol[]>(ROLES, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);

    if (roles && roles.length > 0 && !roles.includes(usuario.rol)) {
      throw new ForbiddenException('No tenés permiso para hacer eso.');
    }

    return true;
  }
}
