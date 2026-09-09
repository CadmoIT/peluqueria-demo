// Módulo raíz de la API. Registra la configuración validada, el limitador de
// peticiones y los módulos de dominio.
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

import { BaseDatosModulo } from './comun/base-datos/base-datos.modulo';
import { validarEntorno } from './configuracion/entorno';
import { CatalogoModulo } from './modulos/catalogo/catalogo.modulo';
import { DisponibilidadModulo } from './modulos/disponibilidad/disponibilidad.modulo';
import { ReservasModulo } from './modulos/reservas/reservas.modulo';
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
    BaseDatosModulo,
    SaludModulo,
    DisponibilidadModulo,
    CatalogoModulo,
    ReservasModulo,
  ],
})
export class AppModule {}
