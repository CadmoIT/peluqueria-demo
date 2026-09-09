// Rutas del catálogo público.
import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { ProfesionalPublico, ServicioPublico, SucursalPublica } from '@manly/contratos';

import { CatalogoServicio } from './catalogo.servicio';

/** Valida que el parámetro de ruta tenga forma de identificador. */
const FORMA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function exigirId(valor: string, queCosa: string): string {
  if (!FORMA_UUID.test(valor)) {
    throw new NotFoundException(`No se encontró ${queCosa}.`);
  }

  return valor;
}

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
  servicios(@Param('id') id: string): Promise<ServicioPublico[]> {
    return this.catalogo.serviciosDeSucursal(exigirId(id, 'la sucursal'));
  }

  @Get('servicios/:id/profesionales')
  @ApiOperation({ summary: 'Profesionales que prestan un servicio en una sucursal' })
  @ApiQuery({ name: 'sucursalId', required: true })
  profesionales(
    @Param('id') id: string,
    @Query('sucursalId') sucursalId: string,
  ): Promise<ProfesionalPublico[]> {
    return this.catalogo.profesionalesDeServicio(
      exigirId(id, 'el servicio'),
      exigirId(sucursalId ?? '', 'la sucursal'),
    );
  }
}
