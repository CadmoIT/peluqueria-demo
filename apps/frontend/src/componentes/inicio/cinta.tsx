// Franja de datos que corre debajo de la portada.
//
// Su razón de ser es el corte entre la fotografía y el primer párrafo: antes
// ahí había un salto de fondo y nada más, y la página arrancaba vacía. La
// cinta ocupa ese lugar con lo que alguien busca apenas entra —qué se hace,
// dónde, cómo se reserva— y de paso da una textura que el blanco no da.
//
// La lista va dos veces: el desplazamiento recorre la mitad de la pista, así
// que al reiniciar la segunda copia está exactamente donde arrancó la primera
// y el ciclo no tiene costura. La copia repetida se oculta a los lectores de
// pantalla, que si no leerían todo dos veces. El movimiento y la pausa al
// pasar el puntero están en `tokens.css`.
import { Fragment } from 'react';

interface Propiedades {
  /** Los datos a repetir, en el orden en que se leen. */
  piezas: string[];
}

export function Cinta({ piezas }: Propiedades) {
  return (
    <div className="cinta bg-tinta text-lino border-carbon overflow-hidden border-y py-3.5">
      <div className="cinta-pista flex w-max">
        {[0, 1].map((copia) => (
          <ul
            key={copia}
            aria-hidden={copia === 1 ? true : undefined}
            className="flex shrink-0 items-center"
          >
            {piezas.map((pieza) => (
              <Fragment key={pieza}>
                <li className="versales text-nota whitespace-nowrap">{pieza}</li>
                {/* El punto es un separador dibujado, no contenido: nadie
                    necesita escuchar «punto» entre dato y dato. */}
                <li aria-hidden className="text-ceniza px-6 text-[0.5rem]">
                  ●
                </li>
              </Fragment>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}
