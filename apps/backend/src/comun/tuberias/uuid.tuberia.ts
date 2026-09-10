// Valida que un parámetro de ruta tenga forma de identificador.
//
// Sin esto, un `/panel/reservas/cualquier-cosa` llega hasta PostgreSQL, que
// rechaza el texto por no ser un uuid, y la API devuelve 500. Un identificador
// mal formado no es un error del servidor: es una dirección que no existe.
//
// Responde **404 y no 400** a propósito. Para quien pregunta, un identificador
// imposible y uno que simplemente no está no se distinguen, y esa indistinción
// es la que evita que se pueda sondear qué identificadores existen.
import { NotFoundException, type PipeTransform } from '@nestjs/common';

const FORMA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class UuidTuberia implements PipeTransform<string, string> {
  /** @param queCosa Cómo nombrar lo que no se encontró, en el mensaje de error. */
  constructor(private readonly queCosa = 'lo que buscabas') {}

  transform(valor: string): string {
    if (!FORMA_UUID.test(valor)) {
      throw new NotFoundException(`No se encontró ${this.queCosa}.`);
    }

    return valor;
  }
}
