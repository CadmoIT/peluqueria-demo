// Estado del sistema para el panel.
import { Module } from '@nestjs/common';

import { DiagnosticoControlador } from './diagnostico.controlador';
import { DiagnosticoServicio } from './diagnostico.servicio';

@Module({
  controllers: [DiagnosticoControlador],
  providers: [DiagnosticoServicio],
})
export class DiagnosticoModulo {}
