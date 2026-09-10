// Llamadas del panel a la API.
//
// Todas viajan con la cookie de sesión, que `consultarApi` ya manda por
// `credentials: 'include'`. La cookie es `httpOnly`, así que el JavaScript de la
// página no puede leerla ni guardarla: quién está adentro se sabe preguntándole
// a la API, no mirando el navegador.
import type {
  Asistencia,
  Diagnostico,
  BloqueAgenda,
  BloqueoCreado,
  CambioConfiguracion,
  CambioSucursal,
  ConfiguracionNegocio,
  DatosProfesionalPanel,
  DatosServicioPanel,
  DatosSucursalPanel,
  EntradaAuditoria,
  FallaOperativa,
  HorarioSemanal,
  Invitacion,
  NuevoBloqueo,
  PagoPresencial,
  Reintegro,
  ReservaDetallePanel,
  ReservaManual,
  ResolucionSolicitud,
  SolicitudPanel,
  UsuarioPanel,
  UsuarioSesion,
} from '@manly/contratos';

import { consultarApi } from './api';

/** Arma la cadena de consulta descartando lo que no vino. */
function consulta(parametros: Record<string, string | number | boolean | undefined>): string {
  const partes = Object.entries(parametros).filter(
    ([, valor]) => valor !== undefined && valor !== '',
  );

  return partes.length > 0
    ? `?${new URLSearchParams(partes.map(([clave, valor]) => [clave, String(valor)])).toString()}`
    : '';
}

function enviar<T>(ruta: string, metodo: string, cuerpo?: unknown): Promise<T> {
  return consultarApi<T>(ruta, {
    method: metodo,
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
}

// ── Sesión ───────────────────────────────────────────────────────────────────

export function quienSoy(): Promise<UsuarioSesion> {
  return consultarApi<UsuarioSesion>('/panel/acceso/yo');
}

export function ingresar(datos: { email: string; contrasenia: string }): Promise<UsuarioSesion> {
  return enviar<UsuarioSesion>('/panel/acceso/ingresar', 'POST', datos);
}

export function salir(): Promise<{ ok: true }> {
  return enviar<{ ok: true }>('/panel/acceso/salir', 'POST');
}

export function aceptarInvitacion(datos: {
  token: string;
  contrasenia: string;
}): Promise<UsuarioSesion> {
  return enviar<UsuarioSesion>('/panel/acceso/invitacion', 'POST', datos);
}

export function pedirRecuperacion(email: string): Promise<{ mensaje: string }> {
  return enviar<{ mensaje: string }>('/panel/acceso/recuperar', 'POST', { email });
}

export function confirmarRecuperacion(datos: {
  token: string;
  contrasenia: string;
}): Promise<UsuarioSesion> {
  return enviar<UsuarioSesion>('/panel/acceso/recuperar/confirmar', 'POST', datos);
}

// ── Agenda ───────────────────────────────────────────────────────────────────

export function obtenerAgenda(parametros: {
  sucursalId: string;
  desde: string;
  hasta: string;
  profesionalId?: string;
}): Promise<BloqueAgenda[]> {
  return consultarApi<BloqueAgenda[]>(`/panel/agenda${consulta(parametros)}`);
}

export function obtenerReserva(id: string): Promise<ReservaDetallePanel> {
  return consultarApi<ReservaDetallePanel>(`/panel/reservas/${id}`);
}

export function crearReservaManual(datos: ReservaManual): Promise<{ reservaId: string }> {
  return enviar<{ reservaId: string }>('/panel/reservas', 'POST', datos);
}

export function marcarAsistencia(id: string, datos: Asistencia): Promise<{ ok: true }> {
  return enviar<{ ok: true }>(`/panel/reservas/${id}/asistencia`, 'POST', datos);
}

export function cancelarReserva(
  id: string,
  motivo?: string,
): Promise<{ ok: true; avisado: boolean }> {
  return enviar<{ ok: true; avisado: boolean }>(`/panel/reservas/${id}/cancelar`, 'POST', {
    motivo,
  });
}

// ── Bloqueos ─────────────────────────────────────────────────────────────────

export interface BloqueoListado {
  id: string;
  profesionalId: string | null;
  profesionalNombre: string | null;
  sucursalId: string | null;
  sucursalNombre: string | null;
  tipo: 'bloqueo' | 'feriado' | 'disponibilidad_extra';
  comienzaEn: string;
  terminaEn: string;
  motivo: string | null;
}

export function obtenerBloqueos(parametros: {
  desde: string;
  hasta: string;
  sucursalId?: string;
}): Promise<BloqueoListado[]> {
  return consultarApi<BloqueoListado[]>(`/panel/bloqueos${consulta(parametros)}`);
}

export function crearBloqueo(datos: NuevoBloqueo): Promise<BloqueoCreado> {
  return enviar<BloqueoCreado>('/panel/bloqueos', 'POST', datos);
}

export function borrarBloqueo(id: string): Promise<{ ok: true }> {
  return enviar<{ ok: true }>(`/panel/bloqueos/${id}`, 'DELETE');
}

// ── Solicitudes ──────────────────────────────────────────────────────────────

export function obtenerSolicitudes(estado?: string): Promise<SolicitudPanel[]> {
  return consultarApi<SolicitudPanel[]>(`/panel/solicitudes${consulta({ estado })}`);
}

export function contarSolicitudesPendientes(): Promise<{ total: number }> {
  return consultarApi<{ total: number }>('/panel/solicitudes/pendientes');
}

export function resolverSolicitud(
  id: string,
  decision: ResolucionSolicitud,
): Promise<{ resultado: string; mensaje: string }> {
  return enviar(`/panel/solicitudes/${id}/resolver`, 'POST', decision);
}

// ── Catálogo ─────────────────────────────────────────────────────────────────

export interface SucursalAdmin extends DatosSucursalPanel {
  id: string;
}

export interface ServicioAdmin extends DatosServicioPanel {
  id: string;
}

export interface ProfesionalAdmin extends DatosProfesionalPanel {
  id: string;
  usuarioId: string | null;
}

export function obtenerSucursalesAdmin(): Promise<SucursalAdmin[]> {
  return consultarApi<SucursalAdmin[]>('/panel/sucursales');
}

export function crearSucursal(datos: DatosSucursalPanel): Promise<{ id: string }> {
  return enviar<{ id: string }>('/panel/sucursales', 'POST', datos);
}

export function actualizarSucursal(id: string, datos: CambioSucursal): Promise<SucursalAdmin> {
  return enviar<SucursalAdmin>(`/panel/sucursales/${id}`, 'PATCH', datos);
}

export function obtenerServiciosAdmin(): Promise<ServicioAdmin[]> {
  return consultarApi<ServicioAdmin[]>('/panel/servicios');
}

export function crearServicio(datos: DatosServicioPanel): Promise<{ id: string }> {
  return enviar<{ id: string }>('/panel/servicios', 'POST', datos);
}

export function actualizarServicio(id: string, datos: DatosServicioPanel): Promise<{ ok: true }> {
  return enviar<{ ok: true }>(`/panel/servicios/${id}`, 'PATCH', datos);
}

export function obtenerProfesionalesAdmin(): Promise<ProfesionalAdmin[]> {
  return consultarApi<ProfesionalAdmin[]>('/panel/profesionales');
}

export function crearProfesional(datos: DatosProfesionalPanel): Promise<{ id: string }> {
  return enviar<{ id: string }>('/panel/profesionales', 'POST', datos);
}

export function actualizarProfesional(
  id: string,
  datos: DatosProfesionalPanel,
): Promise<{ ok: true }> {
  return enviar<{ ok: true }>(`/panel/profesionales/${id}`, 'PATCH', datos);
}

// ── Horarios ─────────────────────────────────────────────────────────────────

export interface FranjaGuardada {
  id: string;
  profesionalId: string;
  sucursalId: string;
  diaSemana: number;
  comienza: string;
  termina: string;
}

export function obtenerHorarios(parametros: {
  profesionalId?: string;
  sucursalId?: string;
}): Promise<FranjaGuardada[]> {
  return consultarApi<FranjaGuardada[]>(`/panel/horarios${consulta(parametros)}`);
}

export function guardarHorario(horario: HorarioSemanal): Promise<{ ok: true }> {
  return enviar<{ ok: true }>('/panel/horarios', 'PUT', horario);
}

// ── Configuración ────────────────────────────────────────────────────────────

export function obtenerConfiguracion(): Promise<ConfiguracionNegocio> {
  return consultarApi<ConfiguracionNegocio>('/panel/configuracion');
}

export function guardarConfiguracion(datos: CambioConfiguracion): Promise<ConfiguracionNegocio> {
  return enviar<ConfiguracionNegocio>('/panel/configuracion', 'PATCH', datos);
}

// ── Pagos ────────────────────────────────────────────────────────────────────

export function registrarPagoPresencial(datos: PagoPresencial): Promise<{ id: string }> {
  return enviar<{ id: string }>('/panel/pagos/presencial', 'POST', datos);
}

export function reintegrar(
  datos: Reintegro,
): Promise<{ id: string; ok: boolean; mensaje: string }> {
  return enviar('/panel/pagos/reintegro', 'POST', datos);
}

// ── Usuarios ─────────────────────────────────────────────────────────────────

export function obtenerUsuarios(): Promise<UsuarioPanel[]> {
  return consultarApi<UsuarioPanel[]>('/panel/usuarios');
}

export function invitar(datos: Invitacion): Promise<{ url: string }> {
  return enviar<{ url: string }>('/panel/usuarios/invitaciones', 'POST', datos);
}

export function cambiarActivo(id: string, activo: boolean): Promise<{ ok: true }> {
  return enviar<{ ok: true }>(`/panel/usuarios/${id}/activo`, 'PATCH', { activo });
}

export function vincularProfesional(
  profesionalId: string,
  usuarioId: string | null,
): Promise<{ ok: true }> {
  return enviar<{ ok: true }>(`/panel/usuarios/profesionales/${profesionalId}`, 'PATCH', {
    usuarioId,
  });
}

// ── Estado del sistema ───────────────────────────────────────────────────────

export function obtenerDiagnostico(): Promise<Diagnostico> {
  return consultarApi<Diagnostico>('/panel/diagnostico');
}

// ── Auditoría y fallas ───────────────────────────────────────────────────────

export function obtenerAuditoria(parametros: {
  entidad?: string;
  pagina?: number;
  porPagina?: number;
}): Promise<{ entradas: EntradaAuditoria[]; total: number }> {
  return consultarApi(`/panel/auditoria${consulta(parametros)}`);
}

export function obtenerFallas(desdeDias = 7): Promise<FallaOperativa[]> {
  return consultarApi<FallaOperativa[]>(`/panel/fallas${consulta({ desdeDias })}`);
}
