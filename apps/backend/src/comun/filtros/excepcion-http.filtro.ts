// Normaliza todas las respuestas de error de la API a una forma única,
// para que la web pueda tratarlas sin conocer el origen de la excepción.
//
// Es además el punto por donde se reporta al servicio de errores. **Sólo los
// 5xx**: un 404, un 401 o un 409 no son fallas del sistema sino respuestas
// correctas a pedidos que no correspondían, y reportarlos ahoga la señal —el
// panel se llenaría de "401" cada vez que a alguien se le vence la sesión—.
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { limpiarUrl } from '@manly/observabilidad';

import { reportarExcepcion } from '../../configuracion/observabilidad';

export interface RespuestaError {
  estado: number;
  mensaje: string;
  ruta: string;
  marcaTiempo: string;
  /** Qué campo falló y por qué, cuando el error es de validación. */
  detalles?: unknown;
}

@Catch()
export class ExcepcionHttpFiltro implements ExceptionFilter {
  private readonly registro = new Logger(ExcepcionHttpFiltro.name);

  catch(excepcion: unknown, host: ArgumentsHost): void {
    const contexto = host.switchToHttp();
    const respuesta = contexto.getResponse<Response>();
    const peticion = contexto.getRequest<Request>();

    const esHttp = excepcion instanceof HttpException;
    const estado = esHttp ? excepcion.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    if (estado >= HttpStatus.INTERNAL_SERVER_ERROR) {
      if (!esHttp) {
        this.registro.error('Excepción no controlada', excepcion);
      }

      // La ruta va limpia: el token del enlace de gestión viaja en la URL y es
      // la credencial de la reserva, no un identificador.
      reportarExcepcion(excepcion, {
        ruta: limpiarUrl(peticion.url),
        metodo: peticion.method,
        usuarioId: (peticion as Request & { usuario?: { id: string } }).usuario?.id,
      });
    }

    // Una excepción HTTP puede llevar un objeto como cuerpo, que es donde la
    // tubería de Zod pone qué campo falló. Si se usara sólo `message` ese
    // detalle se perdería y el cliente recibiría un "Bad Request" pelado.
    const cuerpoOriginal: unknown = esHttp ? excepcion.getResponse() : null;

    const { mensaje, detalles } = interpretar(cuerpoOriginal, esHttp, excepcion);

    const cuerpo: RespuestaError = {
      estado,
      mensaje,
      ruta: peticion.url,
      marcaTiempo: new Date().toISOString(),
      ...(detalles === undefined ? {} : { detalles }),
    };

    respuesta.status(estado).json(cuerpo);
  }
}

/** Extrae mensaje y detalles del cuerpo que traiga la excepción. */
function interpretar(
  cuerpo: unknown,
  esHttp: boolean,
  excepcion: unknown,
): { mensaje: string; detalles?: unknown } {
  if (!esHttp) {
    return { mensaje: 'Error interno del servidor.' };
  }

  if (typeof cuerpo === 'string') {
    return { mensaje: cuerpo };
  }

  if (typeof cuerpo === 'object' && cuerpo !== null) {
    const registro = cuerpo as Record<string, unknown>;
    const propio = registro.mensaje ?? registro.message;

    return {
      mensaje: typeof propio === 'string' ? propio : (excepcion as HttpException).message,
      detalles: registro.detalles,
    };
  }

  return { mensaje: (excepcion as HttpException).message };
}
