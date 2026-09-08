// Arranque del worker: conecta con pg-boss, registra procesadores y trabajos
// recurrentes, y se apaga de forma ordenada ante SIGINT/SIGTERM.
import PgBoss from 'pg-boss';

import { leerEntorno } from './configuracion/entorno.js';
import { registrarTrabajosRecurrentes } from './planificador/index.js';
import { registrarProcesadores } from './procesadores/index.js';

async function arrancar(): Promise<void> {
  const entorno = leerEntorno();

  const cola = new PgBoss({
    connectionString: entorno.DATABASE_URL_DIRECTA,
    schema: 'trabajos',
  });

  cola.on('error', (error) => {
    console.error('Error en la cola de trabajos:', error);
  });

  await cola.start();
  await registrarProcesadores(cola);
  await registrarTrabajosRecurrentes(cola, entorno.ZONA_HORARIA);

  console.warn('Worker operativo.');

  const detener = async (senial: string): Promise<void> => {
    console.warn(`Recibida ${senial}, deteniendo el worker...`);
    await cola.stop({ graceful: true });
    process.exit(0);
  };

  process.on('SIGINT', () => void detener('SIGINT'));
  process.on('SIGTERM', () => void detener('SIGTERM'));
}

arrancar().catch((error: unknown) => {
  console.error('No se pudo arrancar el worker:', error);
  process.exit(1);
});
