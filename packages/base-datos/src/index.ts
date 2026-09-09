// Punto de entrada del paquete de base de datos.
export * from './conexion';
export * from './migraciones';
export * as esquemas from './esquemas/index';
export * from './repositorios/index';

// Las semillas se exportan para poder sembrar una base efímera desde otro
// proceso; ejecutar el archivo directamente sigue siendo la vía normal.
export { asegurarConfiguracion, cargarDemostracion } from './semillas/index';
