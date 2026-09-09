// Agrupa el flujo de reserva y la gestión sin cuenta.
import { Module } from '@nestjs/common';

import { ReservasControlador } from './reservas.controlador';
import { ReservasServicio } from './reservas.servicio';

@Module({
  controllers: [ReservasControlador],
  providers: [ReservasServicio],
})
export class ReservasModulo {}
