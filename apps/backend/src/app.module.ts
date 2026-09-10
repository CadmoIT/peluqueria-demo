// Módulo raíz de la API. Registra la configuración validada, el limitador de
// peticiones y los módulos de dominio.
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';

import { BaseDatosModulo } from './comun/base-datos/base-datos.modulo';
import { rastrearOrigen } from './comun/limite-peticiones';
import { validarEntorno } from './configuracion/entorno';
import { AdministracionModulo } from './modulos/administracion/administracion.modulo';
import { AgendaModulo } from './modulos/agenda/agenda.modulo';
import { AuditoriaModulo } from './modulos/auditoria/auditoria.modulo';
import { AutenticacionModulo } from './modulos/autenticacion/autenticacion.modulo';
import { CatalogoModulo } from './modulos/catalogo/catalogo.modulo';
import { DisponibilidadModulo } from './modulos/disponibilidad/disponibilidad.modulo';
import { PagosModulo } from './modulos/pagos/pagos.modulo';
import { ReservasModulo } from './modulos/reservas/reservas.modulo';
import { SaludModulo } from './modulos/salud/salud.modulo';
import { SolicitudesModulo } from './modulos/solicitudes/solicitudes.modulo';
import { UsuariosModulo } from './modulos/usuarios/usuarios.modulo';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validarEntorno,
    }),
    // Límite general. Las rutas que necesitan uno más estricto lo piden con
    // `@LimiteAcceso()` o `@LimiteReserva()`, que lo reemplazan para esa ruta.
    //
    // El número sale de lo que hace una persona de verdad: nadie consulta
    // disponibilidad más de dos veces por segundo de forma sostenida. Lo que
    // pasa de ahí no es uso, es abuso.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: seconds(60), limit: 120 }],
      getTracker: rastrearOrigen,
    }),
    BaseDatosModulo,
    AutenticacionModulo,
    AuditoriaModulo,
    SaludModulo,
    DisponibilidadModulo,
    CatalogoModulo,
    ReservasModulo,
    PagosModulo,

    // Panel interno.
    AgendaModulo,
    SolicitudesModulo,
    AdministracionModulo,
    UsuariosModulo,
  ],
  providers: [
    // Va antes que el guardián de sesión: una inundación de peticiones sin
    // credenciales tiene que rebotar acá, no después de consultar la base.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
