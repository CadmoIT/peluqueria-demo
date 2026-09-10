// Solicitudes de cambio que resuelve gerencia.
import { Module } from '@nestjs/common';

import { NotificacionesModulo } from '../notificaciones/notificaciones.modulo';
import { ReservasModulo } from '../reservas/reservas.modulo';
import { SolicitudesControlador } from './solicitudes.controlador';
import { SolicitudesServicio } from './solicitudes.servicio';

@Module({
  imports: [ReservasModulo, NotificacionesModulo],
  controllers: [SolicitudesControlador],
  providers: [SolicitudesServicio],
})
export class SolicitudesModulo {}
