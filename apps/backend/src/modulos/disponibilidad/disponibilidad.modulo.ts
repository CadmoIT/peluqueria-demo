// Agrupa la búsqueda de disponibilidad.
import { Module } from '@nestjs/common';

import { DisponibilidadControlador } from './disponibilidad.controlador';
import { DisponibilidadServicio } from './disponibilidad.servicio';

@Module({
  controllers: [DisponibilidadControlador],
  providers: [DisponibilidadServicio],
})
export class DisponibilidadModulo {}
