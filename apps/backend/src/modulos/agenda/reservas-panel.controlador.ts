// Gestión de reservas desde el panel.
//
// Es la contracara de `reservas.controlador.ts`, que es el que usa el cliente
// con el token de su enlace. Acá se llega por identificador y con sesión, y las
// acciones **no miran la anticipación mínima**: esa política rige para el
// cliente, no para el local. Si el profesional se enfermó, el turno se cancela
// aunque falten dos horas.
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  esquemaAsistencia,
  esquemaReservaManual,
  type Asistencia,
  type ReservaDetallePanel,
  type ReservaManual,
  type UsuarioSesion,
} from '@manly/contratos';
import type { Request } from 'express';

import { Roles, Usuario } from '../../comun/decoradores/sesion.decorador';
import { ValidacionZodTuberia } from '../../comun/tuberias/validacion-zod.tuberia';
import { UuidTuberia } from '../../comun/tuberias/uuid.tuberia';
import { AuditoriaServicio } from '../auditoria/auditoria.servicio';
import { AgendaServicio } from './agenda.servicio';
import { ReservasPanelServicio } from './reservas-panel.servicio';

@ApiTags('panel')
@Controller('panel/reservas')
export class ReservasPanelControlador {
  constructor(
    private readonly reservas: ReservasPanelServicio,
    private readonly agenda: AgendaServicio,
    private readonly auditoria: AuditoriaServicio,
  ) {}

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una reserva, con sus movimientos de dinero' })
  detalle(
    @Param('id', new UuidTuberia('esa reserva')) id: string,
    @Usuario() usuario: UsuarioSesion,
  ): Promise<ReservaDetallePanel> {
    return this.reservas.detalle(id, usuario);
  }

  @Post()
  @Roles('gerencia')
  @ApiOperation({ summary: 'Carga un turno a mano, ya confirmado' })
  async crearManual(
    @Body(new ValidacionZodTuberia(esquemaReservaManual)) pedido: ReservaManual,
    @Usuario() usuario: UsuarioSesion,
    @Req() peticion: Request,
  ): Promise<{ reservaId: string }> {
    const { reservaId } = await this.reservas.crearManual(pedido, usuario);

    await this.auditoria.registrar({
      usuario,
      accion: 'reserva.creada_a_mano',
      entidad: 'reservas',
      entidadId: reservaId,
      // El token del enlace no se audita: es la credencial del cliente y en la
      // base sólo vive su hash.
      despues: { ...pedido, bloques: pedido.bloques.length },
      peticion,
    });

    return { reservaId };
  }

  @Post(':id/asistencia')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marca el turno como completado o como ausente' })
  async asistencia(
    @Param('id', new UuidTuberia('esa reserva')) id: string,
    @Body(new ValidacionZodTuberia(esquemaAsistencia)) pedido: Asistencia,
    @Usuario() usuario: UsuarioSesion,
    @Req() peticion: Request,
  ): Promise<{ ok: true }> {
    if (!(await this.agenda.marcarAsistencia(id, pedido.estado))) {
      throw new NotFoundException('Esa reserva no está confirmada o no existe.');
    }

    await this.auditoria.registrar({
      usuario,
      accion: `reserva.${pedido.estado}`,
      entidad: 'reservas',
      entidadId: id,
      despues: pedido,
      peticion,
    });

    return { ok: true };
  }

  @Post(':id/cancelar')
  @Roles('gerencia')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancela un turno por decisión del local' })
  async cancelar(
    @Param('id', new UuidTuberia('esa reserva')) id: string,
    @Body() cuerpo: { motivo?: string },
    @Usuario() usuario: UsuarioSesion,
    @Req() peticion: Request,
  ): Promise<{ ok: true; avisado: boolean }> {
    const { avisado } = await this.reservas.cancelar(id);

    await this.auditoria.registrar({
      usuario,
      accion: 'reserva.cancelada_por_el_local',
      entidad: 'reservas',
      entidadId: id,
      despues: { motivo: cuerpo.motivo ?? null, avisado },
      peticion,
    });

    return { ok: true, avisado };
  }
}
