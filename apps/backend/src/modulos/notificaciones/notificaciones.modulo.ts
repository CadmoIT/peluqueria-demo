// Agrupa el encolado de notificaciones.
//
// No tiene controlador propio: se usa desde reservas y pagos. El despacho lo
// hace el worker, que lee la misma bandeja.
import { Module } from '@nestjs/common';

import { NotificacionesServicio } from './notificaciones.servicio';

@Module({
  providers: [NotificacionesServicio],
  exports: [NotificacionesServicio],
})
export class NotificacionesModulo {}
