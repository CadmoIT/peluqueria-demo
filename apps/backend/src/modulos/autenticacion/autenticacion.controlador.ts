// Rutas de acceso al panel.
//
// La sesión viaja en una cookie `httpOnly`: el JavaScript de la página no puede
// leerla, así que un XSS no alcanza para robársela. `sameSite: lax` impide que
// otro sitio la use en peticiones de escritura, y `secure` la limita a HTTPS
// fuera de desarrollo.
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  esquemaAceptarInvitacion,
  esquemaCambioContrasenia,
  esquemaIngreso,
  esquemaPedidoRecuperacion,
  type AceptarInvitacion,
  type CambioContrasenia,
  type Ingreso,
  type PedidoRecuperacion,
  type UsuarioSesion,
} from '@manly/contratos';
import type { Request, Response } from 'express';

import { SinSesion, Usuario } from '../../comun/decoradores/sesion.decorador';
import { COOKIE_SESION } from '../../comun/guardianes/sesion.guardian';
import { ValidacionZodTuberia } from '../../comun/tuberias/validacion-zod.tuberia';
import type { Entorno } from '../../configuracion/entorno';
import { AutenticacionServicio, type SesionCreada } from './autenticacion.servicio';

@ApiTags('autenticacion')
@Controller('panel/acceso')
export class AutenticacionControlador {
  constructor(
    private readonly autenticacion: AutenticacionServicio,
    private readonly configuracion: ConfigService<Entorno, true>,
  ) {}

  @Post('ingresar')
  @SinSesion()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Abre una sesión del panel' })
  async ingresar(
    @Body(new ValidacionZodTuberia(esquemaIngreso)) pedido: Ingreso,
    @Req() peticion: Request,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<UsuarioSesion> {
    const sesion = await this.autenticacion.ingresar(
      pedido.email,
      pedido.contrasenia,
      peticion.get('user-agent'),
    );

    this.ponerCookie(respuesta, sesion);

    return sesion.usuario;
  }

  @Post('salir')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cierra la sesión' })
  async salir(
    @Req() peticion: Request & { cookies?: Record<string, string> },
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<{ ok: true }> {
    await this.autenticacion.salir(peticion.cookies?.[COOKIE_SESION]);

    respuesta.clearCookie(COOKIE_SESION, this.opcionesCookie());

    return { ok: true };
  }

  @Get('yo')
  @ApiOperation({ summary: 'Quién está usando el panel' })
  yo(@Usuario() usuario: UsuarioSesion): UsuarioSesion {
    return usuario;
  }

  @Post('invitacion')
  @SinSesion()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Acepta una invitación y define la contraseña' })
  async aceptarInvitacion(
    @Body(new ValidacionZodTuberia(esquemaAceptarInvitacion)) pedido: AceptarInvitacion,
    @Req() peticion: Request,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<UsuarioSesion> {
    const sesion = await this.autenticacion.aceptarInvitacion(
      pedido.token,
      pedido.contrasenia,
      peticion.get('user-agent'),
    );

    this.ponerCookie(respuesta, sesion);

    return sesion.usuario;
  }

  /**
   * Pide un enlace de recuperación.
   *
   * Responde lo mismo exista o no la cuenta. Si la respuesta cambiara, este
   * endpoint serviría para averiguar qué direcciones están registradas.
   */
  @Post('recuperar')
  @SinSesion()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pide un enlace para recuperar la contraseña' })
  async recuperar(
    @Body(new ValidacionZodTuberia(esquemaPedidoRecuperacion)) pedido: PedidoRecuperacion,
  ): Promise<{ mensaje: string }> {
    await this.autenticacion.pedirRecuperacion(pedido.email);

    return {
      mensaje: 'Si esa dirección tiene acceso al panel, te llega un correo con el enlace.',
    };
  }

  @Post('recuperar/confirmar')
  @SinSesion()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cambia la contraseña con el enlace de recuperación' })
  async confirmarRecuperacion(
    @Body(new ValidacionZodTuberia(esquemaCambioContrasenia)) pedido: CambioContrasenia,
    @Req() peticion: Request,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<UsuarioSesion> {
    const sesion = await this.autenticacion.cambiarContrasenia(
      pedido.token,
      pedido.contrasenia,
      peticion.get('user-agent'),
    );

    this.ponerCookie(respuesta, sesion);

    return sesion.usuario;
  }

  private ponerCookie(respuesta: Response, sesion: SesionCreada): void {
    respuesta.cookie(COOKIE_SESION, sesion.token, {
      ...this.opcionesCookie(),
      expires: sesion.expiraEn,
    });
  }

  private opcionesCookie() {
    const enProduccion = this.configuracion.get('NODE_ENV', { infer: true }) === 'production';

    return {
      httpOnly: true,
      // En desarrollo la API va por HTTP, así que `secure` la haría inservible.
      secure: enProduccion,
      sameSite: 'lax' as const,
      path: '/',
    };
  }
}
