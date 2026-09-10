// Administración de los accesos al panel.
import { Module } from '@nestjs/common';

import { AutenticacionModulo } from '../autenticacion/autenticacion.modulo';
import { UsuariosControlador } from './usuarios.controlador';
import { UsuariosServicio } from './usuarios.servicio';

@Module({
  imports: [AutenticacionModulo],
  controllers: [UsuariosControlador],
  providers: [UsuariosServicio],
})
export class UsuariosModulo {}
