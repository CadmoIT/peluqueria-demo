// Expone el estado del proceso para el monitor externo y los chequeos de despliegue.
import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SinSesion } from '../../comun/decoradores/sesion.decorador';

// Todo el controlador es público: lo usa el sitio, sin sesión.
@SinSesion()
@ApiTags('salud')
@Controller('salud')
export class SaludControlador {
  @Get()
  @ApiOperation({ summary: 'Estado del servicio' })
  consultar() {
    return {
      estado: 'operativo',
      version: process.env.npm_package_version ?? '0.0.0',
      marcaTiempo: new Date().toISOString(),
    };
  }
}
