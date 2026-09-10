// Rutas de administración del catálogo.
//
// **Modificar** es de gerencia. Un profesional no cambia precios ni da de alta
// sucursales, y ni siquiera edita su propio horario: lo suyo lo define el local,
// si no cada uno se armaría la semana que le conviene.
//
// **Leer** lo puede hacer cualquiera con sesión, porque el panel lo necesita
// para funcionar: sin la lista de sucursales y profesionales no hay agenda que
// dibujar. Tampoco hay nada que esconder ahí —los precios y los nombres están
// publicados en el sitio—; lo que se cuida es la configuración del negocio, que
// sí queda restringida.
//
// Cada cambio deja constancia en auditoría con los valores de antes y de
// después: saber que alguien tocó un precio sirve poco si no queda de cuánto a
// cuánto.
import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  esquemaCambioConfiguracion,
  esquemaCambioSucursal,
  esquemaDatosProfesional,
  esquemaDatosServicio,
  esquemaDatosSucursal,
  esquemaHorarioSemanal,
  type CambioConfiguracion,
  type CambioSucursal,
  type DatosProfesionalPanel,
  type DatosServicioPanel,
  type DatosSucursalPanel,
  type HorarioSemanal,
  type UsuarioSesion,
} from '@manly/contratos';
import type { Request } from 'express';

import { Roles, Usuario } from '../../comun/decoradores/sesion.decorador';
import { ValidacionZodTuberia } from '../../comun/tuberias/validacion-zod.tuberia';
import { UuidTuberia } from '../../comun/tuberias/uuid.tuberia';
import { AuditoriaServicio } from '../auditoria/auditoria.servicio';
import { AdministracionServicio } from './administracion.servicio';

@ApiTags('panel')
@Controller('panel')
export class AdministracionControlador {
  constructor(
    private readonly administracion: AdministracionServicio,
    private readonly auditoria: AuditoriaServicio,
  ) {}

  // ── Sucursales ─────────────────────────────────────────────────────────────

  @Get('sucursales')
  @ApiOperation({ summary: 'Sucursales, incluidas las inactivas' })
  sucursales() {
    return this.administracion.listarSucursales();
  }

  @Roles('gerencia')
  @Post('sucursales')
  @ApiOperation({ summary: 'Crea una sucursal' })
  async crearSucursal(
    @Body(new ValidacionZodTuberia(esquemaDatosSucursal)) datos: DatosSucursalPanel,
    @Usuario() usuario: UsuarioSesion,
    @Req() peticion: Request,
  ) {
    const id = await this.administracion.crearSucursal(datos);

    await this.auditoria.registrar({
      usuario,
      accion: 'sucursal.creada',
      entidad: 'sucursales',
      entidadId: id,
      despues: datos,
      peticion,
    });

    return { id };
  }

  @Roles('gerencia')
  @Patch('sucursales/:id')
  @ApiOperation({ summary: 'Modifica una sucursal' })
  async actualizarSucursal(
    @Param('id', new UuidTuberia('esa sucursal')) id: string,
    @Body(new ValidacionZodTuberia(esquemaCambioSucursal)) datos: CambioSucursal,
    @Usuario() usuario: UsuarioSesion,
    @Req() peticion: Request,
  ) {
    const antes = await this.administracion.buscarSucursal(id);
    const despues = await this.administracion.actualizarSucursal(id, datos);

    await this.auditoria.registrar({
      usuario,
      accion: 'sucursal.modificada',
      entidad: 'sucursales',
      entidadId: id,
      antes,
      despues,
      peticion,
    });

    return despues;
  }

  // ── Servicios ──────────────────────────────────────────────────────────────

  @Get('servicios')
  @ApiOperation({ summary: 'Servicios, incluidos los inactivos' })
  servicios() {
    return this.administracion.listarServicios();
  }

  @Roles('gerencia')
  @Post('servicios')
  @ApiOperation({ summary: 'Crea un servicio' })
  async crearServicio(
    @Body(new ValidacionZodTuberia(esquemaDatosServicio)) datos: DatosServicioPanel,
    @Usuario() usuario: UsuarioSesion,
    @Req() peticion: Request,
  ) {
    const id = await this.administracion.crearServicio(datos);

    await this.auditoria.registrar({
      usuario,
      accion: 'servicio.creado',
      entidad: 'servicios',
      entidadId: id,
      despues: datos,
      peticion,
    });

    return { id };
  }

  /**
   * Modifica un servicio.
   *
   * El cambio **no alcanza a las reservas ya tomadas**: precio, duración y
   * buffers viajaron como copia a la reserva en el momento de reservarla.
   */
  @Roles('gerencia')
  @Patch('servicios/:id')
  @ApiOperation({ summary: 'Modifica un servicio' })
  async actualizarServicio(
    @Param('id', new UuidTuberia('ese servicio')) id: string,
    @Body(new ValidacionZodTuberia(esquemaDatosServicio)) datos: DatosServicioPanel,
    @Usuario() usuario: UsuarioSesion,
    @Req() peticion: Request,
  ) {
    const antes = (await this.administracion.listarServicios()).find(
      (servicio) => servicio.id === id,
    );

    await this.administracion.actualizarServicio(id, datos);

    await this.auditoria.registrar({
      usuario,
      accion: 'servicio.modificado',
      entidad: 'servicios',
      entidadId: id,
      antes,
      despues: datos,
      peticion,
    });

    return { ok: true };
  }

  // ── Profesionales ──────────────────────────────────────────────────────────

  @Get('profesionales')
  @ApiOperation({ summary: 'Profesionales, incluidos los inactivos' })
  profesionales() {
    return this.administracion.listarProfesionales();
  }

  @Roles('gerencia')
  @Post('profesionales')
  @ApiOperation({ summary: 'Da de alta un profesional' })
  async crearProfesional(
    @Body(new ValidacionZodTuberia(esquemaDatosProfesional)) datos: DatosProfesionalPanel,
    @Usuario() usuario: UsuarioSesion,
    @Req() peticion: Request,
  ) {
    const id = await this.administracion.crearProfesional(datos);

    await this.auditoria.registrar({
      usuario,
      accion: 'profesional.creado',
      entidad: 'profesionales',
      entidadId: id,
      despues: datos,
      peticion,
    });

    return { id };
  }

  @Roles('gerencia')
  @Patch('profesionales/:id')
  @ApiOperation({ summary: 'Modifica un profesional' })
  async actualizarProfesional(
    @Param('id', new UuidTuberia('ese profesional')) id: string,
    @Body(new ValidacionZodTuberia(esquemaDatosProfesional)) datos: DatosProfesionalPanel,
    @Usuario() usuario: UsuarioSesion,
    @Req() peticion: Request,
  ) {
    const antes = (await this.administracion.listarProfesionales()).find(
      (profesional) => profesional.id === id,
    );

    await this.administracion.actualizarProfesional(id, datos);

    await this.auditoria.registrar({
      usuario,
      accion: 'profesional.modificado',
      entidad: 'profesionales',
      entidadId: id,
      antes,
      despues: datos,
      peticion,
    });

    return { ok: true };
  }

  // ── Horarios ───────────────────────────────────────────────────────────────

  @Get('horarios')
  @ApiOperation({ summary: 'Horario semanal de un profesional o de una sucursal' })
  horarios(
    @Query('profesionalId') profesionalId?: string,
    @Query('sucursalId') sucursalId?: string,
  ) {
    return this.administracion.listarHorarios({ profesionalId, sucursalId });
  }

  /**
   * Guarda la semana completa de un profesional en una sucursal.
   *
   * Es PUT y no PATCH porque reemplaza: lo que no venga en la lista deja de
   * existir. Aplicarlo franja por franja abriría la puerta a dejar media semana
   * cargada si algo falla en el medio.
   */
  @Roles('gerencia')
  @Put('horarios')
  @ApiOperation({ summary: 'Reemplaza el horario semanal' })
  async guardarHorario(
    @Body(new ValidacionZodTuberia(esquemaHorarioSemanal)) horario: HorarioSemanal,
    @Usuario() usuario: UsuarioSesion,
    @Req() peticion: Request,
  ) {
    const antes = await this.administracion.listarHorarios({
      profesionalId: horario.profesionalId,
      sucursalId: horario.sucursalId,
    });

    await this.administracion.guardarHorario(horario);

    await this.auditoria.registrar({
      usuario,
      accion: 'horario.reemplazado',
      entidad: 'horarios_semanales',
      entidadId: horario.profesionalId,
      antes,
      despues: horario.franjas,
      peticion,
    });

    return { ok: true };
  }

  // ── Configuración del negocio ──────────────────────────────────────────────

  @Roles('gerencia')
  @Get('configuracion')
  @ApiOperation({ summary: 'Configuración global del negocio' })
  configuracion() {
    return this.administracion.leerConfiguracion();
  }

  @Roles('gerencia')
  @Patch('configuracion')
  @ApiOperation({ summary: 'Modifica la configuración global' })
  async actualizarConfiguracion(
    @Body(new ValidacionZodTuberia(esquemaCambioConfiguracion)) datos: CambioConfiguracion,
    @Usuario() usuario: UsuarioSesion,
    @Req() peticion: Request,
  ) {
    const antes = await this.administracion.leerConfiguracion();
    const despues = await this.administracion.actualizarConfiguracion(datos);

    await this.auditoria.registrar({
      usuario,
      accion: 'configuracion.modificada',
      entidad: 'configuracion_negocio',
      entidadId: null,
      antes,
      despues,
      peticion,
    });

    return despues;
  }
}
