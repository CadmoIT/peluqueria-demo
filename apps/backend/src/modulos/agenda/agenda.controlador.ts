// Rutas de la agenda y de los bloqueos.
//
// La agenda la ve cualquiera con sesión, pero el servicio recorta lo que
// devuelve según el rol: quien es profesional sólo obtiene sus propios bloques
// y sin los datos de contacto del cliente.
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  esquemaConsultaAgenda,
  esquemaNuevoBloqueo,
  type BloqueAgenda,
  type BloqueoCreado,
  type ConsultaAgendaPanel,
  type NuevoBloqueo,
  type UsuarioSesion,
} from '@manly/contratos';
import type { Request } from 'express';

import { Roles, Usuario } from '../../comun/decoradores/sesion.decorador';
import { ValidacionZodTuberia } from '../../comun/tuberias/validacion-zod.tuberia';
import { AuditoriaServicio } from '../auditoria/auditoria.servicio';
import { AgendaServicio } from './agenda.servicio';

@ApiTags('panel')
@Controller('panel')
export class AgendaControlador {
  constructor(
    private readonly agenda: AgendaServicio,
    private readonly auditoria: AuditoriaServicio,
  ) {}

  @Get('agenda')
  @ApiOperation({ summary: 'Turnos de una sucursal en un rango' })
  agendaDe(
    @Query(new ValidacionZodTuberia(esquemaConsultaAgenda)) consulta: ConsultaAgendaPanel,
    @Usuario() usuario: UsuarioSesion,
  ): Promise<BloqueAgenda[]> {
    return this.agenda.consultar(consulta, usuario);
  }

  @Get('bloqueos')
  @ApiOperation({ summary: 'Bloqueos y feriados vigentes en un rango' })
  bloqueos(
    @Query('desde') desde: string,
    @Query('hasta') hasta: string,
    @Query('sucursalId') sucursalId?: string,
  ) {
    if (!desde || !hasta) {
      throw new NotFoundException('Faltan las fechas del rango.');
    }

    return this.agenda.listarBloqueos({ desde, hasta, sucursalId });
  }

  @Post('bloqueos')
  @ApiOperation({ summary: 'Bloquea una franja de la agenda' })
  async crearBloqueo(
    @Body(new ValidacionZodTuberia(esquemaNuevoBloqueo)) pedido: NuevoBloqueo,
    @Usuario() usuario: UsuarioSesion,
    @Req() peticion: Request,
  ): Promise<BloqueoCreado> {
    const creado = await this.agenda.crearBloqueo(pedido, usuario);

    await this.auditoria.registrar({
      usuario,
      accion: 'bloqueo.creado',
      entidad: 'excepciones_horario',
      entidadId: creado.id,
      despues: pedido,
      peticion,
    });

    return creado;
  }

  @Delete('bloqueos/:id')
  @Roles('gerencia')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Levanta un bloqueo' })
  async borrarBloqueo(
    @Param('id') id: string,
    @Usuario() usuario: UsuarioSesion,
    @Req() peticion: Request,
  ): Promise<{ ok: true }> {
    if (!(await this.agenda.borrarBloqueo(id))) {
      throw new NotFoundException('Ese bloqueo no existe.');
    }

    await this.auditoria.registrar({
      usuario,
      accion: 'bloqueo.levantado',
      entidad: 'excepciones_horario',
      entidadId: id,
      peticion,
    });

    return { ok: true };
  }
}
