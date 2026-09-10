// Estado del servicio, para el monitor externo y la verificación de despliegue.
//
// **Comprueba la base de datos.** Antes devolvía `operativo` sin tocar nada, y
// eso es peor que no tener chequeo: el paso de verificación posterior al
// despliegue mira justamente esta ruta, así que un despliegue con la base caída
// pasaba en verde. Un chequeo que siempre dice que sí no informa, tranquiliza.
//
// Cuando la base no responde devuelve **503**, que es lo que el balanceador y
// el monitor entienden como "no me mandes tráfico".
import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { latenciaBaseDatos, type BaseDatos } from '@manly/base-datos';

import { BASE_DATOS } from '../../comun/base-datos/base-datos.modulo';
import { SinSesion } from '../../comun/decoradores/sesion.decorador';

interface EstadoDelServicio {
  estado: 'operativo';
  version: string;
  baseDatosMs: number;
  marcaTiempo: string;
}

// Público: lo consulta el monitor externo, que no tiene credenciales.
@SinSesion()
@ApiTags('salud')
@Controller('salud')
export class SaludControlador {
  constructor(@Inject(BASE_DATOS) private readonly bd: BaseDatos) {}

  @Get()
  @ApiOperation({ summary: 'Estado del servicio y de su conexión a la base' })
  async consultar(): Promise<EstadoDelServicio> {
    let baseDatosMs: number;

    try {
      baseDatosMs = await latenciaBaseDatos(this.bd);
    } catch (error: unknown) {
      // El detalle no sale al exterior: esta ruta es pública y el mensaje de
      // un error de conexión suele traer el servidor y el usuario.
      throw new ServiceUnavailableException('El servicio no está disponible.', {
        cause: error,
      });
    }

    return {
      estado: 'operativo',
      version: process.env.npm_package_version ?? '0.0.0',
      baseDatosMs,
      marcaTiempo: new Date().toISOString(),
    };
  }
}
