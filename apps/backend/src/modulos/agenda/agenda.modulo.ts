// Agenda del panel y gestión de reservas desde adentro.
import { Module } from '@nestjs/common';

import { NotificacionesModulo } from '../notificaciones/notificaciones.modulo';
import { ReservasModulo } from '../reservas/reservas.modulo';
import { AgendaControlador } from './agenda.controlador';
import { AgendaServicio } from './agenda.servicio';
import { ReservasPanelControlador } from './reservas-panel.controlador';
import { ReservasPanelServicio } from './reservas-panel.servicio';

@Module({
  imports: [ReservasModulo, NotificacionesModulo],
  controllers: [AgendaControlador, ReservasPanelControlador],
  providers: [AgendaServicio, ReservasPanelServicio],
  exports: [AgendaServicio, ReservasPanelServicio],
})
export class AgendaModulo {}
