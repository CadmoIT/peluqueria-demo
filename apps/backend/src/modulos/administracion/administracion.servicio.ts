// Altas, bajas y modificaciones del catálogo.
//
// Un solo servicio para sucursales, servicios, profesionales, horarios y
// configuración: las cuatro cosas comparten las mismas reglas y separarlas en
// cuatro servicios idénticos sólo multiplicaría el lugar donde equivocarse.
//
// Nada se borra. Todo se da de baja con su bandera `activo`: un DELETE
// arrastraría reservas históricas o quedaría trabado por las claves foráneas, y
// en los dos casos se perdería el rastro de lo que pasó.
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  actualizarConfiguracion,
  actualizarProfesional,
  actualizarServicio,
  actualizarSucursal,
  buscarSucursalAdmin,
  crearProfesional,
  crearServicio,
  crearSucursal,
  leerConfiguracion,
  listarHorarios,
  listarProfesionalesAdmin,
  listarServiciosAdmin,
  listarSucursalesAdmin,
  reemplazarHorarioSemanal,
  type BaseDatos,
  type ConfiguracionEditable,
  type FranjaSemanal,
  type ProfesionalAdministrado,
  type ServicioAdministrado,
  type SucursalAdministrada,
} from '@manly/base-datos';
import type {
  CambioConfiguracion,
  CambioSucursal,
  DatosProfesionalPanel,
  DatosServicioPanel,
  DatosSucursalPanel,
  HorarioSemanal,
} from '@manly/contratos';

import { BASE_DATOS } from '../../comun/base-datos/base-datos.modulo';

@Injectable()
export class AdministracionServicio {
  constructor(@Inject(BASE_DATOS) private readonly bd: BaseDatos) {}

  // ── Sucursales ─────────────────────────────────────────────────────────────

  listarSucursales(): Promise<SucursalAdministrada[]> {
    return listarSucursalesAdmin(this.bd);
  }

  async buscarSucursal(id: string): Promise<SucursalAdministrada> {
    const sucursal = await buscarSucursalAdmin(this.bd, id);

    if (!sucursal) {
      throw new NotFoundException('No encontramos esa sucursal.');
    }

    return sucursal;
  }

  crearSucursal(datos: DatosSucursalPanel): Promise<string> {
    return crearSucursal(this.bd, datos);
  }

  async actualizarSucursal(id: string, datos: CambioSucursal): Promise<SucursalAdministrada> {
    if (!(await actualizarSucursal(this.bd, id, datos))) {
      throw new NotFoundException('No encontramos esa sucursal.');
    }

    return this.buscarSucursal(id);
  }

  // ── Servicios ──────────────────────────────────────────────────────────────

  listarServicios(): Promise<ServicioAdministrado[]> {
    return listarServiciosAdmin(this.bd);
  }

  crearServicio(datos: DatosServicioPanel): Promise<string> {
    return crearServicio(this.bd, datos);
  }

  async actualizarServicio(id: string, datos: Partial<DatosServicioPanel>): Promise<void> {
    if (!(await actualizarServicio(this.bd, id, datos))) {
      throw new NotFoundException('No encontramos ese servicio.');
    }
  }

  // ── Profesionales ──────────────────────────────────────────────────────────

  listarProfesionales(): Promise<ProfesionalAdministrado[]> {
    return listarProfesionalesAdmin(this.bd);
  }

  crearProfesional(datos: DatosProfesionalPanel): Promise<string> {
    return crearProfesional(this.bd, datos);
  }

  async actualizarProfesional(id: string, datos: Partial<DatosProfesionalPanel>): Promise<void> {
    if (!(await actualizarProfesional(this.bd, id, datos))) {
      throw new NotFoundException('No encontramos ese profesional.');
    }
  }

  // ── Horarios ───────────────────────────────────────────────────────────────

  listarHorarios(filtros: {
    profesionalId?: string;
    sucursalId?: string;
  }): Promise<FranjaSemanal[]> {
    return listarHorarios(this.bd, filtros);
  }

  /**
   * Reemplaza la semana completa.
   *
   * No toca los turnos ya tomados: sacarle a alguien el jueves a la tarde no
   * cancela lo que ya tenía ese jueves. Eso se ve en la agenda y se resuelve a
   * mano, que es lo correcto —cancelar turnos como efecto colateral de editar
   * un horario sería una sorpresa cara.
   */
  async guardarHorario(horario: HorarioSemanal): Promise<void> {
    await reemplazarHorarioSemanal(this.bd, horario);
  }

  // ── Configuración ──────────────────────────────────────────────────────────

  async leerConfiguracion(): Promise<ConfiguracionEditable> {
    const configuracion = await leerConfiguracion(this.bd);

    if (!configuracion) {
      throw new NotFoundException('Todavía no hay configuración cargada.');
    }

    return configuracion;
  }

  async actualizarConfiguracion(datos: CambioConfiguracion): Promise<ConfiguracionEditable> {
    const actual = await this.leerConfiguracion();

    // El segundo recordatorio no puede ser antes que el primero: llegarían al
    // revés y el "falta poco" caería antes que el "es mañana".
    const primero = datos.horasRecordatorioPrimero ?? actual.horasRecordatorioPrimero;
    const segundo =
      datos.horasRecordatorioSegundo === undefined
        ? actual.horasRecordatorioSegundo
        : datos.horasRecordatorioSegundo;

    if (segundo !== null && segundo >= primero) {
      throw new BadRequestException(
        'El segundo recordatorio tiene que ser más cerca del turno que el primero.',
      );
    }

    await actualizarConfiguracion(this.bd, datos);

    return this.leerConfiguracion();
  }
}
