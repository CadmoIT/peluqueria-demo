// Resumen de lo que se está por reservar.
//
// Muestra la secuencia exacta —qué servicio, con quién y a qué hora— antes de
// confirmar. El plan lo pide explícitamente: nadie debería descubrir el orden
// de sus servicios recién al llegar al local.
import type { OpcionDisponibilidad } from '@manly/contratos';

import { formatearDiaYHora, formatearHora, formatearPrecio } from '@/utilidades/formato';

interface Propiedades {
  opcion: OpcionDisponibilidad;
  totales: { precio: number; senia: number; duracion: number };
}

export function ResumenReserva({ opcion, totales }: Propiedades) {
  return (
    <div className="border-borde bg-niebla rounded-tarjeta border p-5">
      <p className="text-base">{formatearDiaYHora(opcion.comienzaEn)}</p>

      <ol className="border-borde mt-4 flex flex-col gap-3 border-t pt-4">
        {opcion.bloques.map((bloque) => (
          <li key={bloque.orden} className="flex items-baseline justify-between gap-4">
            <span className="text-menor">
              <span className="text-grafito tabular-nums">{formatearHora(bloque.comienzaEn)}</span>{' '}
              {bloque.servicioNombre}
              <span className="text-grafito"> · {bloque.profesionalNombre}</span>
            </span>
            <span className="text-menor shrink-0">{formatearPrecio(bloque.precioCentavos)}</span>
          </li>
        ))}
      </ol>

      <div className="border-borde mt-4 flex items-baseline justify-between border-t pt-4">
        <span className="versales text-nota text-grafito">Total</span>
        <span className="text-base">{formatearPrecio(totales.precio)}</span>
      </div>

      {totales.senia > 0 ? (
        <p className="text-nota text-grafito mt-2">
          Se abona una seña de {formatearPrecio(totales.senia)} para confirmar. El resto se paga en
          el local.
        </p>
      ) : null}
    </div>
  );
}
