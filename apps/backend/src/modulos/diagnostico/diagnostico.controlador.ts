// Estado del sistema.
//
// Sólo gerencia: dice qué está simulado y qué no, y esa información le ahorra
// trabajo a quien quiera aprovecharse. Es además la pantalla que se mira antes
// de anunciar que el sitio está andando.
import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Diagnostico } from '@manly/contratos';

import { Roles } from '../../comun/decoradores/sesion.decorador';
import { DiagnosticoServicio } from './diagnostico.servicio';

@Roles('gerencia')
@ApiTags('panel')
@Controller('panel/diagnostico')
export class DiagnosticoControlador {
  constructor(private readonly diagnostico: DiagnosticoServicio) {}

  @Get()
  @ApiOperation({ summary: 'Señales de que el sistema está haciendo su trabajo' })
  consultar(): Promise<Diagnostico> {
    return this.diagnostico.consultar();
  }
}
