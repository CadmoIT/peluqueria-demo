// Carga de una pantalla del panel.
//
// Deja puesta la carcasa del panel —la barra con sus secciones— para que el
// equipo pueda cambiar de pantalla sin esperar a que termine la anterior.
//
// No reemplaza a los indicadores que ya hay dentro de cada pantalla: éste
// cubre la espera del servidor, y aquéllos la de las consultas que salen
// después, ya con la pantalla dibujada.
import { Cargando } from '@manly/interfaz';

export default function CargandoPantallaPanel() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Cargando mensaje="Un momento…" />
    </div>
  );
}
