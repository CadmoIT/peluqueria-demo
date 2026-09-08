// Módulo raíz de la API. Registra la configuración validada, el limitador de
// peticiones y los módulos de dominio.
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

import { validarEntorno } from './configuracion/entorno';
import { SaludModulo } from './modulos/salud/salud.modulo';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validarEntorno,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    SaludModulo,
  ],
})
export class AppModule {}
