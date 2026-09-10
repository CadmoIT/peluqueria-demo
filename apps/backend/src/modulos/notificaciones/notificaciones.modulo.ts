// Agrupa el encolado de notificaciones y la vista de las que no llegaron.
//
// El encolado se usa desde reservas y pagos; el despacho lo hace el worker,
// que lee la misma bandeja. Lo único que se expone por HTTP son las fallidas,
// para que gerencia las vea.
import { Module } from '@nestjs/common';

import { FallasControlador } from './fallas.controlador';
import { NotificacionesServicio } from './notificaciones.servicio';

@Module({
  controllers: [FallasControlador],
  providers: [NotificacionesServicio],
  exports: [NotificacionesServicio],
})
export class NotificacionesModulo {}
