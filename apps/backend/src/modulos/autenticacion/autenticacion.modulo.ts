// Agrupa el acceso al panel.
//
// El guardián de sesión se registra como global de la aplicación, así que toda
// ruta nueva queda protegida por omisión y hay que abrirla explícitamente con
// `@SinSesion()`. Lo contrario —proteger a mano cada ruta— falla en cuanto
// alguien se olvida una vez.
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { SesionGuardian } from '../../comun/guardianes/sesion.guardian';
import { AutenticacionControlador } from './autenticacion.controlador';
import { AutenticacionServicio } from './autenticacion.servicio';

@Module({
  controllers: [AutenticacionControlador],
  providers: [AutenticacionServicio, { provide: APP_GUARD, useClass: SesionGuardian }],
  exports: [AutenticacionServicio],
})
export class AutenticacionModulo {}
