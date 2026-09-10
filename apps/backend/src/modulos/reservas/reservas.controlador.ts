// Rutas del flujo de reserva y de la gestión sin cuenta.
//
// Las rutas de `mi-reserva` se identifican con el token del enlace privado, que
// es la única credencial del cliente: no hay cuenta ni sesión.
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  esquemaPedidoCancelacion,
  esquemaPedidoConfirmacion,
  esquemaPedidoReprogramacion,
  esquemaPedidoRetencion,
  type PedidoCancelacion,
  type PedidoConfirmacion,
  type PedidoReprogramacion,
  type PedidoRetencion,
  type ReservaPublica,
  type ResultadoGestion,
  type Retencion,
} from '@manly/contratos';

import { ValidacionZodTuberia } from '../../comun/tuberias/validacion-zod.tuberia';
import { ReservasServicio } from './reservas.servicio';
import { SinSesion } from '../../comun/decoradores/sesion.decorador';

// Todo el controlador es público: lo usa el sitio, sin sesión.
@SinSesion()
@ApiTags('reservas')
@Controller()
export class ReservasControlador {
  constructor(private readonly reservas: ReservasServicio) {}

  @Post('reservas/retener')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Retiene el horario elegido por diez minutos' })
  retener(
    @Body(new ValidacionZodTuberia(esquemaPedidoRetencion)) pedido: PedidoRetencion,
  ): Promise<Retencion> {
    return this.reservas.retener(pedido);
  }

  @Post('reservas')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Completa la reserva retenida con los datos del cliente' })
  confirmar(
    @Body(new ValidacionZodTuberia(esquemaPedidoConfirmacion)) pedido: PedidoConfirmacion,
  ): Promise<ReservaPublica> {
    return this.reservas.confirmar(pedido);
  }

  @Get('mi-reserva/:token')
  @ApiOperation({ summary: 'Consulta una reserva por su enlace privado' })
  consultar(@Param('token') token: string): Promise<ReservaPublica> {
    return this.reservas.consultar(token);
  }

  @Post('mi-reserva/:token/cancelar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancela la reserva o deja una solicitud para el local' })
  cancelar(
    @Param('token') token: string,
    @Body(new ValidacionZodTuberia(esquemaPedidoCancelacion)) pedido: PedidoCancelacion,
  ): Promise<ResultadoGestion> {
    return this.reservas.cancelar(token, pedido.motivo ?? null);
  }

  @Post('mi-reserva/:token/reprogramar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mueve la reserva a otro horario' })
  reprogramar(
    @Param('token') token: string,
    @Body(new ValidacionZodTuberia(esquemaPedidoReprogramacion)) pedido: PedidoReprogramacion,
  ): Promise<ResultadoGestion> {
    return this.reservas.reprogramar(token, pedido);
  }
}
