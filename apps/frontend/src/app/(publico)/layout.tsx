// Estructura común de las páginas públicas: encabezado, contenido y pie.
import { Encabezado } from '@/componentes/navegacion/encabezado';
import { PieDePagina } from '@/componentes/navegacion/pie-de-pagina';

export default function LayoutPublico({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* Permite saltear la navegación con el teclado. Sólo visible al enfocarlo. */}
      <a href="#contenido" className="salto-al-contenido versales text-menor">
        Saltar al contenido
      </a>

      <Encabezado />

      <main id="contenido" className="flex-1">
        {children}
      </main>

      <PieDePagina />
    </div>
  );
}
