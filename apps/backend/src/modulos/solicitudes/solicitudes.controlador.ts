// Rutas de las solicitudes de cambio.
//
// Sólo gerencia: aprobar una cancelación mueve dinero y aprobar una
// reprogramación reordena la agenda de otra persona.
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  esquemaResolucionSolicitud,
  type ResolucionSolicitud,
  type SolicitudPanel,
  type UsuarioSesion,
} from '@manly/contratos';
import type { Request } from 'express';

import { Roles, Usuario } from '../../comun/decoradores/sesion.decorador';
import { ValidacionZodTuberia } from '../../comun/tuberias/validacion-zod.tuberia';
import { AuditoriaServicio } from '../auditoria/auditoria.servicio';
import { SolicitudesServicio } from './solicitudes.servicio';

const ESTADOS = ['pendiente', 'aprobada', 'rechazada'] as const;

@Roles('gerencia')
@ApiTags('panel')
@Controller('panel/solicitudes')
export class SolicitudesControlador {
  constructor(
    private readonly solicitudes: SolicitudesServicio,
    private readonly auditoria: AuditoriaServicio,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Solicitudes de cambio, las pendientes primero' })
  listar(
    @Query('estado') estado?: string,
    @Query('sucursalId') sucursalId?: string,
  ): Promise<SolicitudPanel[]> {
    return this.solicitudes.listar({
      estado: ESTADOS.find((valor) => valor === estado),
      sucursalId,
    });
  }

  @Get('pendientes')
  @ApiOperation({ summary: 'Cuántas esperan resolución' })
  async pendientes(): Promise<{ total: number }> {
    return { total: await this.solicitudes.pendientes() };
  }

  @Post(':id/resolver')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aprueba o rechaza una solicitud' })
  async resolver(
    @Param('id') id: string,
    @Body(new ValidacionZodTuberia(esquemaResolucionSolicitud)) decision: ResolucionSolicitud,
    @Usuario() usuario: UsuarioSesion,
    @Req() peticion: Request,
  ): Promise<{ resultado: string; mensaje: string }> {
    const resuelta = await this.solicitudes.resolver(id, decision, usuario);

    await this.auditoria.registrar({
      usuario,
      accion: `solicitud.${resuelta.resultado}`,
      entidad: 'solicitudes_cambio',
      entidadId: id,
      despues: decision,
      peticion,
    });

    return resuelta;
  }
}
