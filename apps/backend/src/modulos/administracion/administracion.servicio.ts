// Altas, bajas y modificaciones del catálogo.
//
// Un solo servicio para sucursales, servicios, profesionales, horarios y
// configuración: las cuatro cosas comparten las mismas reglas y separarlas en
// cuatro servicios idénticos sólo multiplicaría el lugar donde equivocarse.
//
// Nada se borra. Todo se da de baja con su bandera `activo`: un DELETE
// arrastraría reservas históricas o quedaría trabado por las claves foráneas, y
// en los dos casos se perdería el rastro de lo que pasó.
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
  sucursalesDelProfesional,
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
  UsuarioSesion,
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

  /**
   * El horario semanal, recortado a lo que el rol puede ver.
   *
   * Quien tiene rol profesional ve el suyo y nada más. No es un dato sensible
   * —el horario de atención es público en la práctica—, pero devolverle la
   * semana de toda la sucursal cuando pide la propia es ruido, y con el filtro
   * forzado la pantalla no necesita acordarse de mandarlo.
   */
  listarHorarios(
    filtros: { profesionalId?: string; sucursalId?: string },
    usuario: UsuarioSesion,
  ): Promise<FranjaSemanal[]> {
    if (usuario.rol !== 'profesional') return listarHorarios(this.bd, filtros);

    if (!usuario.profesionalId) {
      throw new ForbiddenException('Tu usuario todavía no está asociado a un profesional.');
    }

    return listarHorarios(this.bd, { ...filtros, profesionalId: usuario.profesionalId });
  }

  /**
   * Reemplaza la semana completa.
   *
   * No toca los turnos ya tomados: sacarle a alguien el jueves a la tarde no
   * cancela lo que ya tenía ese jueves. Eso se ve en la agenda y se resuelve a
   * mano, que es lo correcto —cancelar turnos como efecto colateral de editar
   * un horario sería una sorpresa cara.
   *
   * Cada profesional carga su propia semana; gerencia, la de cualquiera. Las
   * dos restricciones del rol profesional son por lo que pasaría si no
   * estuvieran: sin la primera, cualquiera con acceso al panel podría abrirle o
   * cerrarle la agenda a un compañero; sin la segunda, podría darse horario en
   * un local donde no trabaja.
   */
  async guardarHorario(horario: HorarioSemanal, usuario: UsuarioSesion): Promise<void> {
    if (usuario.rol === 'profesional') {
      if (!usuario.profesionalId) {
        throw new ForbiddenException('Tu usuario todavía no está asociado a un profesional.');
      }

      if (horario.profesionalId !== usuario.profesionalId) {
        throw new ForbiddenException('Sólo podés editar tu propio horario.');
      }

      const suyas = await sucursalesDelProfesional(this.bd, usuario.profesionalId);

      if (!suyas.includes(horario.sucursalId)) {
        throw new ForbiddenException('No atendés en esa sucursal.');
      }
    }

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
