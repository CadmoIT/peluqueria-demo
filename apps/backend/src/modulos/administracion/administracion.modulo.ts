// Administración del catálogo y de la configuración del negocio.
import { Module } from '@nestjs/common';

import { AdministracionControlador } from './administracion.controlador';
import { AdministracionServicio } from './administracion.servicio';

@Module({
  controllers: [AdministracionControlador],
  providers: [AdministracionServicio],
  exports: [AdministracionServicio],
})
export class AdministracionModulo {}
