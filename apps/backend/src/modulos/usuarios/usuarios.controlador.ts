// Administración de los accesos al panel.
//
// No hay registro: se entra sólo por invitación de gerencia. Dar de baja a
// alguien le corta el acceso en el momento —el repositorio le cierra las
// sesiones abiertas—, no cuando venza su cookie.
//
// El enlace de invitación se devuelve acá y **es la única vez que existe**: en
// la base queda sólo su hash.
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  esquemaCambioActivo,
  esquemaInvitacion,
  type CambioActivo,
  type Invitacion,
  type UsuarioPanel,
  type UsuarioSesion,
} from '@manly/contratos';
import type { Request } from 'express';

import { Roles, Usuario } from '../../comun/decoradores/sesion.decorador';
import { ValidacionZodTuberia } from '../../comun/tuberias/validacion-zod.tuberia';
import { UuidTuberia } from '../../comun/tuberias/uuid.tuberia';
import { AuditoriaServicio } from '../auditoria/auditoria.servicio';
import { UsuariosServicio } from './usuarios.servicio';

@Roles('gerencia')
@ApiTags('panel')
@Controller('panel/usuarios')
export class UsuariosControlador {
  constructor(
    private readonly usuarios: UsuariosServicio,
    private readonly auditoria: AuditoriaServicio,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Quiénes tienen acceso al panel' })
  listar(): Promise<UsuarioPanel[]> {
    return this.usuarios.listar();
  }

  @Post('invitaciones')
  @ApiOperation({ summary: 'Invita a alguien al panel' })
  async invitar(
    @Body(new ValidacionZodTuberia(esquemaInvitacion)) datos: Invitacion,
    @Usuario() usuario: UsuarioSesion,
    @Req() peticion: Request,
  ): Promise<{ url: string }> {
    const { url, usuarioId } = await this.usuarios.invitar(datos);

    await this.auditoria.registrar({
      usuario,
      accion: 'usuario.invitado',
      entidad: 'usuarios',
      entidadId: usuarioId,
      // El enlace no se audita: es una credencial mientras siga vigente.
      despues: { email: datos.email, rol: datos.rol },
      peticion,
    });

    return { url };
  }

  @Patch(':id/activo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Da de alta o de baja un acceso' })
  async cambiarActivo(
    @Param('id', new UuidTuberia('ese usuario')) id: string,
    @Body(new ValidacionZodTuberia(esquemaCambioActivo)) datos: CambioActivo,
    @Usuario() usuario: UsuarioSesion,
    @Req() peticion: Request,
  ): Promise<{ ok: true }> {
    await this.usuarios.cambiarActivo(id, datos.activo, usuario);

    await this.auditoria.registrar({
      usuario,
      accion: datos.activo ? 'usuario.reactivado' : 'usuario.dado_de_baja',
      entidad: 'usuarios',
      entidadId: id,
      despues: datos,
      peticion,
    });

    return { ok: true };
  }

  @Patch('profesionales/:profesionalId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Asocia un profesional con su usuario del panel' })
  async vincular(
    @Param('profesionalId', new UuidTuberia('ese profesional')) profesionalId: string,
    @Body() cuerpo: { usuarioId: string | null },
    @Usuario() usuario: UsuarioSesion,
    @Req() peticion: Request,
  ): Promise<{ ok: true }> {
    await this.usuarios.vincular(profesionalId, cuerpo.usuarioId ?? null);

    await this.auditoria.registrar({
      usuario,
      accion: 'profesional.vinculado',
      entidad: 'profesionales',
      entidadId: profesionalId,
      despues: { usuarioId: cuerpo.usuarioId ?? null },
      peticion,
    });

    return { ok: true };
  }
}
