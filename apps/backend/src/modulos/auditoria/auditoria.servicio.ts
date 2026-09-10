// Registro de lo que se hace desde el panel.
//
// Lo usa cualquier módulo que modifique algo. La regla es una sola: **auditar
// nunca puede voltear la operación auditada**. Si el registro falla, la acción
// ya ocurrió y deshacerla porque no se pudo dejar constancia sería peor que
// quedarse sin la constancia. El repositorio traga el error y lo deja en el log.
import { Inject, Injectable } from '@nestjs/common';
import {
  listarAuditoria,
  registrarAuditoria,
  type BaseDatos,
  type FiltrosAuditoria,
} from '@manly/base-datos';
import type { EntradaAuditoria, UsuarioSesion } from '@manly/contratos';
import type { Request } from 'express';

import { BASE_DATOS } from '../../comun/base-datos/base-datos.modulo';

@Injectable()
export class AuditoriaServicio {
  constructor(@Inject(BASE_DATOS) private readonly bd: BaseDatos) {}

  /**
   * Deja constancia de una acción.
   *
   * `antes` y `despues` se guardan enteros: saber que alguien cambió un precio
   * sirve poco si no queda de cuánto a cuánto.
   */
  async registrar(parametros: {
    usuario: UsuarioSesion | null;
    accion: string;
    entidad: string;
    entidadId: string | null;
    antes?: unknown;
    despues?: unknown;
    peticion?: Request;
  }): Promise<void> {
    await registrarAuditoria(this.bd, {
      usuarioId: parametros.usuario?.id ?? null,
      accion: parametros.accion,
      entidad: parametros.entidad,
      entidadId: parametros.entidadId,
      datosAntes: parametros.antes,
      datosDespues: parametros.despues,
      direccionIp: parametros.peticion ? direccionDe(parametros.peticion) : null,
    });
  }

  async listar(
    filtros: FiltrosAuditoria,
  ): Promise<{ entradas: EntradaAuditoria[]; total: number }> {
    const { entradas, total } = await listarAuditoria(this.bd, filtros);

    return {
      total,
      entradas: entradas.map((entrada) => ({
        id: entrada.id,
        usuarioId: entrada.usuarioId,
        usuarioNombre: entrada.usuarioNombre,
        accion: entrada.accion,
        entidad: entrada.entidad,
        entidadId: entrada.entidadId,
        datosAntes: entrada.datosAntes,
        datosDespues: entrada.datosDespues,
        creadoEn: entrada.creadoEn.toISOString(),
      })),
    };
  }
}

/**
 * Dirección de origen de la petición.
 *
 * Detrás del proxy de producción, `req.ip` es la del proxy salvo que Express
 * tenga `trust proxy`. Se toma el primer valor de `x-forwarded-for`, que es el
 * del cliente, y se cae a `req.ip` cuando no hay cabecera.
 */
function direccionDe(peticion: Request): string | null {
  const reenviada = peticion.headers['x-forwarded-for'];
  const primera = Array.isArray(reenviada) ? reenviada[0] : reenviada?.split(',')[0];

  return primera?.trim() ?? peticion.ip ?? null;
}
