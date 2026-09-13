// Carga de una página pública.
//
// Ocupa el hueco del contenido y deja en su sitio el encabezado y el pie: la
// persona sigue viendo dónde está y puede irse a otro lado sin esperar. Por
// eso no cubre la pantalla entera, aunque exista una pantalla completa más
// arriba: ésta, al estar más cerca, es la que Next elige.
import { Cargando } from '@manly/interfaz';

export default function CargandoPagina() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Cargando mensaje="Un momento…" />
    </div>
  );
}
