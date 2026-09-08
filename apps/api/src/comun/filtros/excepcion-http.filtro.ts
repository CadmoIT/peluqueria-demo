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
    const mensaje = esHttp ? excepcion.message : 'Error interno del servidor.';

    if (!esHttp) {
      this.registro.error('Excepción no controlada', excepcion);
    }

    const cuerpo: RespuestaError = {
      estado,
      mensaje,
      ruta: peticion.url,
      marcaTiempo: new Date().toISOString(),
    };

    respuesta.status(estado).json(cuerpo);
  }
}
