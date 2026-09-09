// Normaliza todas las respuestas de error de la API a una forma única,
// para que la web pueda tratarlas sin conocer el origen de la excepción.
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

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

    if (!esHttp) {
      this.registro.error('Excepción no controlada', excepcion);
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
