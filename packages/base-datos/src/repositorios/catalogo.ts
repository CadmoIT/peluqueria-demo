// Consultas del catálogo público.
//
// Devuelven sólo lo que el cliente puede ver, y sólo lo que está activo: un
// servicio o un profesional dado de baja desaparece del sitio sin borrarse.
import { and, asc, eq } from 'drizzle-orm';

import type { BaseDatos } from '../conexion';
import {
  productos,
  profesionales,
  profesionalesServicios,
  profesionalesSucursales,
  servicios,
  serviciosSucursales,
  sucursales,
} from '../esquemas/index';
import { calcularSenia } from './disponibilidad';

export interface SucursalDelCatalogo {
  id: string;
  nombre: string;
  barrio: string;
  direccion: string;
  telefono: string | null;
  whatsapp: string | null;
  urlMapa: string | null;
}

export interface ServicioDelCatalogo {
  id: string;
  nombre: string;
  descripcion: string | null;
  categoria: string | null;
  duracionMinutos: number;
  precioCentavos: number;
  modalidadSenia: 'deshabilitada' | 'fija' | 'porcentual';
  seniaCentavos: number;
}

export interface ProfesionalDelCatalogo {
  id: string;
  nombre: string;
}

/** Sucursales activas, en el orden en que se muestran. */
export async function listarSucursales(bd: BaseDatos): Promise<SucursalDelCatalogo[]> {
  return bd
    .select({
      id: sucursales.id,
      nombre: sucursales.nombre,
      barrio: sucursales.barrio,
      direccion: sucursales.direccion,
      telefono: sucursales.telefono,
      whatsapp: sucursales.whatsapp,
      urlMapa: sucursales.urlMapa,
    })
    .from(sucursales)
    .where(eq(sucursales.activa, true))
    .orderBy(asc(sucursales.orden), asc(sucursales.nombre));
}

/** Servicios activos que se prestan en una sucursal, con la seña ya calculada. */
export async function listarServiciosDeSucursal(
  bd: BaseDatos,
  sucursalId: string,
): Promise<ServicioDelCatalogo[]> {
  const filas = await bd
    .select({
      id: servicios.id,
      nombre: servicios.nombre,
      descripcion: servicios.descripcion,
      categoria: servicios.categoria,
      duracionMinutos: servicios.duracionMinutos,
      precioCentavos: servicios.precioCentavos,
      modalidadSenia: servicios.modalidadSenia,
      seniaFijaCentavos: servicios.seniaFijaCentavos,
      seniaPorcentaje: servicios.seniaPorcentaje,
      minutosPreparacion: servicios.minutosPreparacion,
      minutosLimpieza: servicios.minutosLimpieza,
    })
    .from(servicios)
    .innerJoin(serviciosSucursales, eq(serviciosSucursales.servicioId, servicios.id))
    .where(and(eq(servicios.activo, true), eq(serviciosSucursales.sucursalId, sucursalId)))
    .orderBy(asc(servicios.orden), asc(servicios.nombre));

  return filas.map((fila) => ({
    id: fila.id,
    nombre: fila.nombre,
    descripcion: fila.descripcion,
    categoria: fila.categoria,
    duracionMinutos: fila.duracionMinutos,
    precioCentavos: fila.precioCentavos,
    modalidadSenia: fila.modalidadSenia,
    seniaCentavos: calcularSenia(fila),
  }));
}

/**
 * Profesionales activos que prestan un servicio en una sucursal.
 *
 * Es lo que llena el selector de "profesional o cualquiera": si un profesional
 * no aparece acá, el motor tampoco lo va a asignar.
 */
export async function listarProfesionalesDeServicio(
  bd: BaseDatos,
  parametros: { servicioId: string; sucursalId: string },
): Promise<ProfesionalDelCatalogo[]> {
  const filas = await bd
    .select({
      id: profesionales.id,
      nombre: profesionales.nombre,
      nombreVisible: profesionales.nombreVisible,
    })
    .from(profesionales)
    .innerJoin(profesionalesServicios, eq(profesionalesServicios.profesionalId, profesionales.id))
    .innerJoin(profesionalesSucursales, eq(profesionalesSucursales.profesionalId, profesionales.id))
    .where(
      and(
        eq(profesionales.activo, true),
        eq(profesionalesServicios.servicioId, parametros.servicioId),
        eq(profesionalesSucursales.sucursalId, parametros.sucursalId),
      ),
    )
    .orderBy(asc(profesionales.orden), asc(profesionales.nombre));

  return filas.map((fila) => ({ id: fila.id, nombre: fila.nombreVisible ?? fila.nombre }));
}

/** Una sucursal activa por identificador, o null si no existe. */
export async function buscarSucursal(
  bd: BaseDatos,
  sucursalId: string,
): Promise<SucursalDelCatalogo | null> {
  const [fila] = await bd
    .select({
      id: sucursales.id,
      nombre: sucursales.nombre,
      barrio: sucursales.barrio,
      direccion: sucursales.direccion,
      telefono: sucursales.telefono,
      whatsapp: sucursales.whatsapp,
      urlMapa: sucursales.urlMapa,
    })
    .from(sucursales)
    .where(and(eq(sucursales.id, sucursalId), eq(sucursales.activa, true)))
    .limit(1);

  return fila ?? null;
}

export interface ProductoDelCatalogo {
  id: string;
  nombre: string;
  detalle: string | null;
  precioCentavos: number | null;
  imagenClave: string;
}

/** La línea de productos activa, en el orden en que se muestra. */
export async function listarProductos(bd: BaseDatos): Promise<ProductoDelCatalogo[]> {
  return bd
    .select({
      id: productos.id,
      nombre: productos.nombre,
      detalle: productos.detalle,
      precioCentavos: productos.precioCentavos,
      imagenClave: productos.imagenClave,
    })
    .from(productos)
    .where(eq(productos.activo, true))
    .orderBy(asc(productos.orden), asc(productos.nombre));
}
