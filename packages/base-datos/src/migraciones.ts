// Ubicación de las migraciones.
//
// Se expone desde el paquete para que nadie tenga que adivinar la ruta desde
// afuera. Las migraciones viven en la raíz del paquete y no en `src/`, así esta
// ruta resuelve igual corriendo desde la fuente (tsx) que desde `dist` (node).
import { join } from 'node:path';

export const CARPETA_MIGRACIONES = join(__dirname, '..', 'migraciones');

/** Separador que Drizzle intercala entre las sentencias de una migración. */
export const SEPARADOR_SENTENCIAS = '--> statement-breakpoint';
