// Catálogo público: sucursales, servicios y profesionales.
//
// Es lo que la web consulta para armar el flujo de reserva. Sólo devuelve lo
// activo: dar de baja un servicio lo saca del sitio sin borrar su historia.
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  buscarSucursal,
  listarProductos,
  listarProfesionalesDeServicio,
  listarServiciosDeSucursal,
  configuracionDelNegocio,
  listarSucursales,
  type BaseDatos,
} from '@manly/base-datos';
import type {
  ConfiguracionPublica,
  ProductoPublico,
  ProfesionalPublico,
  ServicioPublico,
  SucursalPublica,
} from '@manly/contratos';

import { BASE_DATOS } from '../../comun/base-datos/base-datos.modulo';

@Injectable()
export class CatalogoServicio {
  constructor(@Inject(BASE_DATOS) private readonly bd: BaseDatos) {}

  listarSucursales(): Promise<SucursalPublica[]> {
    return listarSucursales(this.bd);
  }

  /** La línea de productos que se muestra en la portada. */
  listarProductos(): Promise<ProductoPublico[]> {
    return listarProductos(this.bd);
  }

  /** Si el sitio está tomando reservas, y qué decir cuando no. */
  async configuracionPublica(): Promise<ConfiguracionPublica> {
    const { reservasOnlineActivas, mensajeReservasCerradas } = await configuracionDelNegocio(
      this.bd,
    );

    return { reservasOnlineActivas, mensajeReservasCerradas };
  }

  async serviciosDeSucursal(sucursalId: string): Promise<ServicioPublico[]> {
    // Se verifica la sucursal aparte para poder distinguir "no existe" de
    // "existe pero no tiene servicios cargados".
    const sucursal = await buscarSucursal(this.bd, sucursalId);

    if (!sucursal) {
      throw new NotFoundException('La sucursal no existe o no está disponible.');
    }

    return listarServiciosDeSucursal(this.bd, sucursalId);
  }

  async profesionalesDeServicio(
    servicioId: string,
    sucursalId: string,
  ): Promise<ProfesionalPublico[]> {
    const sucursal = await buscarSucursal(this.bd, sucursalId);

    if (!sucursal) {
      throw new NotFoundException('La sucursal no existe o no está disponible.');
    }

    return listarProfesionalesDeServicio(this.bd, { servicioId, sucursalId });
  }
}
