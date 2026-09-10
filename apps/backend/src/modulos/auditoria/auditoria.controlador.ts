// Historial de acciones del panel.
//
// Sólo lectura y sólo gerencia. Un registro que se pudiera editar o borrar
// desde el mismo panel que audita no serviría para nada.
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  esquemaFiltrosAuditoria,
  type EntradaAuditoria,
  type FiltrosAuditoriaPanel,
} from '@manly/contratos';

import { Roles } from '../../comun/decoradores/sesion.decorador';
import { ValidacionZodTuberia } from '../../comun/tuberias/validacion-zod.tuberia';
import { AuditoriaServicio } from './auditoria.servicio';

@Roles('gerencia')
@ApiTags('panel')
@Controller('panel/auditoria')
export class AuditoriaControlador {
  constructor(private readonly auditoria: AuditoriaServicio) {}

  @Get()
  @ApiOperation({ summary: 'Historial de acciones administrativas' })
  listar(
    @Query(new ValidacionZodTuberia(esquemaFiltrosAuditoria))
    filtros: FiltrosAuditoriaPanel,
  ): Promise<{ entradas: EntradaAuditoria[]; total: number }> {
    return this.auditoria.listar({
      ...filtros,
      desde: filtros.desde ? new Date(filtros.desde) : undefined,
      hasta: filtros.hasta ? new Date(filtros.hasta) : undefined,
    });
  }
}
