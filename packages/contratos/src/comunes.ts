// Tipos y esquemas Zod transversales reutilizados por el resto de los contratos.
import { z } from 'zod';

/** Identificador de cualquier entidad del dominio. */
export const esquemaId = z.string().uuid();

/** Estados posibles de una reserva a lo largo de su ciclo de vida. */
export const estadosReserva = [
  'pendiente_pago',
  'confirmada',
  'cancelada',
  'completada',
  'ausente',
  'expirada',
] as const;

export const esquemaEstadoReserva = z.enum(estadosReserva);
export type EstadoReserva = z.infer<typeof esquemaEstadoReserva>;

/** Canales por los que se le puede notificar a un cliente. */
export const canalesContacto = ['whatsapp', 'email'] as const;

export const esquemaCanalContacto = z.enum(canalesContacto);
export type CanalContacto = z.infer<typeof esquemaCanalContacto>;

/** Modalidades de seña configurables por servicio. */
export const modalidadesSenia = ['deshabilitada', 'fija', 'porcentual'] as const;

export const esquemaModalidadSenia = z.enum(modalidadesSenia);
export type ModalidadSenia = z.infer<typeof esquemaModalidadSenia>;

/** Roles del panel interno. */
export const roles = ['gerencia', 'profesional'] as const;

export const esquemaRol = z.enum(roles);
export type Rol = z.infer<typeof esquemaRol>;

/** Paginación estándar de los listados del panel. */
export const esquemaPaginacion = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
});
export type Paginacion = z.infer<typeof esquemaPaginacion>;
