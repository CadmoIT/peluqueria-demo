// Auditoría del panel. Exporta el servicio porque lo usa todo el que modifica algo.
import { Global, Module } from '@nestjs/common';

import { AuditoriaControlador } from './auditoria.controlador';
import { AuditoriaServicio } from './auditoria.servicio';

// Global: si no, cada módulo del panel tendría que importarlo para dejar
// constancia de lo que hace, y el que se olvidara pasaría inadvertido.
@Global()
@Module({
  controllers: [AuditoriaControlador],
  providers: [AuditoriaServicio],
  exports: [AuditoriaServicio],
})
export class AuditoriaModulo {}
