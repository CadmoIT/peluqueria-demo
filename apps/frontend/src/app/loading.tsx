// Pantalla de carga a página completa.
//
// Es la de más afuera: cubre todo, encabezado y pie incluidos, porque en este
// punto todavía no se sabe si lo que viene es el sitio público o el panel.
//
// Se ve poco y a propósito. Los dos grupos de rutas tienen su propio
// `loading.tsx`, que Next prefiere por estar más cerca de la página que se
// está abriendo; así, moverse dentro del sitio no hace desaparecer la barra de
// navegación. Ésta queda para la primera carga y para cruzar del sitio al
// panel, que son los únicos momentos en que no hay carcasa que conservar.
import { Cargando } from '@manly/interfaz';

export default function CargandoPantallaCompleta() {
  return (
    <div className="bg-lino flex min-h-dvh items-center justify-center">
      <Cargando mensaje="Un momento…" />
    </div>
  );
}
