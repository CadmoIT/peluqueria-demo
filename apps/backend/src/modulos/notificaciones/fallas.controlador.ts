// Avisos que no llegaron.
//
// Es la pantalla que evita el peor caso silencioso del sistema: un cliente que
// nunca se enteró de que su turno cambió, y nadie en el local se enteró de que
// no se enteró. El worker reintenta con espera creciente y, agotados los
// intentos, la notificación queda `fallida` y aparece acá para que alguien
// levante el teléfono.
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FallaOperativa } from '@manly/contratos';

import { Roles } from '../../comun/decoradores/sesion.decorador';
import { NotificacionesServicio } from './notificaciones.servicio';

@Roles('gerencia')
@ApiTags('panel')
@Controller('panel/fallas')
export class FallasControlador {
  constructor(private readonly notificaciones: NotificacionesServicio) {}

  @Get()
  @ApiOperation({ summary: 'Avisos que no se pudieron entregar' })
  listar(@Query('desdeDias') desdeDias?: string): Promise<FallaOperativa[]> {
    const dias = Number(desdeDias);

    return this.notificaciones.fallidas(Number.isFinite(dias) && dias > 0 ? dias : 7);
  }
}
