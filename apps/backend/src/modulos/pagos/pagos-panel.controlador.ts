// Cobros y devoluciones que se hacen en el local.
//
// Sólo gerencia. Son las dos rutas de la API que mueven dinero por decisión de
// una persona y no de la pasarela, así que las dos quedan auditadas con el
// monto, el medio y quién las hizo.
//
// El reintegro exige además una confirmación explícita en el propio cuerpo del
// pedido: devolver plata no puede ser el resultado de un clic de más.
import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  esquemaPagoPresencial,
  esquemaReintegro,
  type PagoPresencial,
  type Reintegro,
  type UsuarioSesion,
} from '@manly/contratos';
import type { Request } from 'express';

import { Roles, Usuario } from '../../comun/decoradores/sesion.decorador';
import { ValidacionZodTuberia } from '../../comun/tuberias/validacion-zod.tuberia';
import { AuditoriaServicio } from '../auditoria/auditoria.servicio';
import { PagosServicio } from './pagos.servicio';

@Roles('gerencia')
@ApiTags('panel')
@Controller('panel/pagos')
export class PagosPanelControlador {
  constructor(
    private readonly pagos: PagosServicio,
    private readonly auditoria: AuditoriaServicio,
  ) {}

  @Post('presencial')
  @ApiOperation({ summary: 'Registra un cobro hecho en el local' })
  async presencial(
    @Body(new ValidacionZodTuberia(esquemaPagoPresencial)) datos: PagoPresencial,
    @Usuario() usuario: UsuarioSesion,
    @Req() peticion: Request,
  ): Promise<{ id: string }> {
    const registrado = await this.pagos.registrarPresencial(datos, usuario.id);

    await this.auditoria.registrar({
      usuario,
      accion: 'pago.presencial_registrado',
      entidad: 'pagos',
      entidadId: registrado.id,
      despues: datos,
      peticion,
    });

    return registrado;
  }

  /**
   * Devuelve dinero.
   *
   * Si el cobro original pasó por la pasarela se intenta devolver por ahí. Si
   * eso falla, el reintegro **queda registrado igual** con el error adjunto: un
   * movimiento de dinero que no se pudo completar tiene que dejar rastro, no
   * desaparecer.
   */
  @Post('reintegro')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reintegra una seña' })
  async reintegro(
    @Body(new ValidacionZodTuberia(esquemaReintegro)) datos: Reintegro,
    @Usuario() usuario: UsuarioSesion,
    @Req() peticion: Request,
  ): Promise<{ id: string; ok: boolean; mensaje: string }> {
    const resultado = await this.pagos.reintegrar(datos, usuario.id);

    await this.auditoria.registrar({
      usuario,
      accion: resultado.ok ? 'pago.reintegrado' : 'pago.reintegro_fallido',
      entidad: 'pagos',
      entidadId: resultado.id,
      despues: { ...datos, ok: resultado.ok },
      peticion,
    });

    return {
      ...resultado,
      mensaje: resultado.ok
        ? 'Reintegro realizado.'
        : 'Quedó registrado, pero la pasarela lo rechazó. Hay que resolverlo a mano.',
    };
  }
}
