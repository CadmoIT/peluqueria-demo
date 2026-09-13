// Punto de entrada de la biblioteca de interfaz compartida.
// Expone los primitivos del sistema de diseño; los componentes propios del
// sitio (navegación, marca, reservas) viven en apps/frontend/src/componentes.
export { Boton, EnlaceBoton, clasesBoton } from './componentes/boton';
export type {
  PropiedadesBoton,
  PropiedadesEnlaceBoton,
  TamanioBoton,
  VarianteBoton,
} from './componentes/boton';

export { Cargando } from './componentes/cargando';
export { Contenedor } from './componentes/contenedor';
export { Seccion } from './componentes/seccion';
export { EncabezadoSeccion } from './componentes/encabezado-seccion';

export * from './utilidades';
