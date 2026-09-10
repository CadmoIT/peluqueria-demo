// Expone la búsqueda de disponibilidad.
//
// Es POST y no GET porque el pedido lleva una lista de servicios con su
// preferencia de profesional, que en una cadena de consulta queda ilegible.
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  esquemaBusquedaDisponibilidad,
  type BusquedaDisponibilidad,
  type RespuestaDisponibilidad,
} from '@manly/contratos';

import { ValidacionZodTuberia } from '../../comun/tuberias/validacion-zod.tuberia';
import { DisponibilidadServicio } from './disponibilidad.servicio';
import { SinSesion } from '../../comun/decoradores/sesion.decorador';

// Todo el controlador es público: lo usa el sitio, sin sesión.
@SinSesion()
@ApiTags('disponibilidad')
@Controller('disponibilidad')
export class DisponibilidadControlador {
  constructor(private readonly disponibilidad: DisponibilidadServicio) {}

  @Post('buscar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Busca secuencias disponibles para una combinación de servicios',
  })
  buscar(
    @Body(new ValidacionZodTuberia(esquemaBusquedaDisponibilidad))
    peticion: BusquedaDisponibilidad,
  ): Promise<RespuestaDisponibilidad> {
    return this.disponibilidad.buscar(peticion);
  }
}
