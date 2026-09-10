// Rutas de pago.
//
// El endpoint del webhook es público y no autenticado: lo que lo protege es la
// firma, no una credencial.
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  esquemaPedidoPreferencia,
  type EstadoDelPago,
  type PedidoPreferencia,
  type PreferenciaCreada,
} from '@manly/contratos';

import { ValidacionZodTuberia } from '../../comun/tuberias/validacion-zod.tuberia';
import { PagosServicio } from './pagos.servicio';

/** Forma del cuerpo que manda Mercado Pago. Los nombres los impone el proveedor. */
interface CuerpoNotificacion {
  action?: string;
  type?: string;
  data?: { id?: string | number };
}

@ApiTags('pagos')
@Controller()
export class PagosControlador {
  constructor(private readonly pagos: PagosServicio) {}

  @Post('pagos/mercado-pago/preferencia')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crea el cobro de la seña y devuelve el enlace de pago' })
  crearPreferencia(
    @Body(new ValidacionZodTuberia(esquemaPedidoPreferencia)) pedido: PedidoPreferencia,
  ): Promise<PreferenciaCreada> {
    return this.pagos.crearPreferencia(pedido.token);
  }

  @Get('pagos/estado/:token')
  @ApiOperation({ summary: 'Estado del pago, para la pantalla de vuelta del checkout' })
  estado(@Param('token') token: string): Promise<EstadoDelPago> {
    return this.pagos.estadoDelPago(token);
  }

  /**
   * Notificación de Mercado Pago.
   *
   * Responde 200 en todos los casos menos firma inválida. Un error acá hace que
   * la pasarela reintente en bucle, y un 200 con la notificación ignorada es
   * preferible a eso: lo que no se procesó queda registrado y lo levanta la
   * reconciliación del worker.
   */
  @Post('webhooks/mercado-pago')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recibe las notificaciones de pago de Mercado Pago' })
  async webhook(
    @Body() cuerpo: CuerpoNotificacion,
    @Query() consulta: Record<string, string>,
    @Headers('x-signature') cabeceraFirma: string | undefined,
    @Headers('x-request-id') idPeticion: string | undefined,
  ): Promise<{ recibido: boolean }> {
    // El identificador puede venir en la cadena de consulta o en el cuerpo.
    const idRecurso =
      consulta['data.id'] ?? consulta.id ?? (cuerpo.data?.id ? String(cuerpo.data.id) : undefined);

    if (!this.pagos.verificarFirma({ cabeceraFirma, idPeticion, idRecurso })) {
      // Sin detalle a propósito: explicarle a quien llama qué parte de la firma
      // falló le ahorra trabajo para el siguiente intento.
      throw new UnauthorizedException('Firma inválida.');
    }

    // Sólo interesan las notificaciones de pagos.
    const tipo = cuerpo.type ?? consulta.type;

    if (tipo && tipo !== 'payment') {
      return { recibido: true };
    }

    // La firma ya garantizó que el identificador existe.
    await this.pagos.procesarNotificacion(idRecurso ?? '');

    return { recibido: true };
  }
}
