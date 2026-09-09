// Valida el cuerpo de una petición contra un esquema Zod de @manly/contratos.
//
// Se usa esta y no el ValidationPipe de Nest: los contratos del proyecto son
// Zod y se comparten con la web, así que la validación del servidor y la del
// cliente son literalmente el mismo esquema.
import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

export class ValidacionZodTuberia<T> implements PipeTransform<unknown, T> {
  constructor(private readonly esquema: ZodSchema<T>) {}

  transform(valor: unknown): T {
    const resultado = this.esquema.safeParse(valor);

    if (!resultado.success) {
      throw new BadRequestException({
        mensaje: 'Los datos enviados no son válidos.',
        detalles: resultado.error.issues.map((problema) => ({
          campo: problema.path.join('.'),
          motivo: problema.message,
        })),
      });
    }

    return resultado.data;
  }
}
