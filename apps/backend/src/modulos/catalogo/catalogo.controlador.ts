// Rutas del catálogo público.
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { ProfesionalPublico, ServicioPublico, SucursalPublica } from '@manly/contratos';

import { CatalogoServicio } from './catalogo.servicio';
import { SinSesion } from '../../comun/decoradores/sesion.decorador';
import { UuidTuberia } from '../../comun/tuberias/uuid.tuberia';

// Todo el controlador es público: lo usa el sitio, sin sesión.
@SinSesion()
@ApiTags('catalogo')
@Controller()
export class CatalogoControlador {
  constructor(private readonly catalogo: CatalogoServicio) {}

  @Get('sucursales')
  @ApiOperation({ summary: 'Sucursales activas' })
  sucursales(): Promise<SucursalPublica[]> {
    return this.catalogo.listarSucursales();
  }

  @Get('sucursales/:id/servicios')
  @ApiOperation({ summary: 'Servicios que se prestan en una sucursal' })
  servicios(@Param('id', new UuidTuberia('esa sucursal')) id: string): Promise<ServicioPublico[]> {
    return this.catalogo.serviciosDeSucursal(id);
  }

  @Get('servicios/:id/profesionales')
  @ApiOperation({ summary: 'Profesionales que prestan un servicio en una sucursal' })
  @ApiQuery({ name: 'sucursalId', required: true })
  profesionales(
    @Param('id', new UuidTuberia('ese servicio')) id: string,
    // La sucursal viaja en la consulta pero es obligatoria: un profesional
    // presta el servicio en una sucursal, no en todas.
    @Query('sucursalId', new UuidTuberia('esa sucursal')) sucursalId: string,
  ): Promise<ProfesionalPublico[]> {
    return this.catalogo.profesionalesDeServicio(id, sucursalId);
  }
}
