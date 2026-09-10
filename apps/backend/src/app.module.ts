// Módulo raíz de la API. Registra la configuración validada, el limitador de
// peticiones y los módulos de dominio.
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

import { BaseDatosModulo } from './comun/base-datos/base-datos.modulo';
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
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
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
})
export class AppModule {}
