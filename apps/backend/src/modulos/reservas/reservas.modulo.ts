// Agrupa el flujo de reserva y la gestión sin cuenta.
import { Module } from '@nestjs/common';

import { NotificacionesModulo } from '../notificaciones/notificaciones.modulo';
import { ReservasControlador } from './reservas.controlador';
import { ReservasServicio } from './reservas.servicio';

@Module({
  imports: [NotificacionesModulo],
  controllers: [ReservasControlador],
  providers: [ReservasServicio],
})
export class ReservasModulo {}
