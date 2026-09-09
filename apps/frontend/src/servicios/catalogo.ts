// Consultas del catálogo público a la API.
import type { ProfesionalPublico, ServicioPublico, SucursalPublica } from '@manly/contratos';

import { consultarApi } from './api';

export function obtenerSucursales(): Promise<SucursalPublica[]> {
  return consultarApi<SucursalPublica[]>('/sucursales');
}

export function obtenerServicios(sucursalId: string): Promise<ServicioPublico[]> {
  return consultarApi<ServicioPublico[]>(`/sucursales/${sucursalId}/servicios`);
}

export function obtenerProfesionales(
  servicioId: string,
  sucursalId: string,
): Promise<ProfesionalPublico[]> {
  return consultarApi<ProfesionalPublico[]>(
    `/servicios/${servicioId}/profesionales?sucursalId=${sucursalId}`,
  );
}
