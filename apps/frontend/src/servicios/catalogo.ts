// Consultas del catálogo público a la API.
import type {
  ConfiguracionPublica,
  ProfesionalPublico,
  ServicioPublico,
  SucursalPublica,
} from '@manly/contratos';

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

/**
 * Si el sitio está tomando reservas.
 *
 * Se consulta antes de dibujar el flujo. Lo que de verdad corta es la API —el
 * interruptor se comprueba al retener—, pero mostrarle a alguien cuatro pasos
 * para que el último le diga que no, es una falta de respeto por su tiempo.
 */
export function obtenerConfiguracionPublica(): Promise<ConfiguracionPublica> {
  return consultarApi<ConfiguracionPublica>('/configuracion-publica');
}
