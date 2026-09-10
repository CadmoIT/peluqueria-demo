// Arranque del worker: conecta con pg-boss, registra procesadores y trabajos
// recurrentes, y se apaga de forma ordenada ante SIGINT/SIGTERM.

// Antes que nada: el SDK de errores instrumenta módulos de Node y tiene que
// cargarse antes de que alguien los use.
import { cerrarObservabilidad, iniciarObservabilidad } from './configuracion/observabilidad';

const observabilidadActiva = iniciarObservabilidad();

import PgBoss from 'pg-boss';

import { cerrarConexion } from './configuracion/base-datos';
import { leerEntorno } from './configuracion/entorno';
import { registrarTrabajosRecurrentes } from './planificador/index';
import { registrarProcesadores } from './procesadores/index';

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
  console.warn(
    observabilidadActiva
      ? 'Reporte de errores: activo.'
      : 'Reporte de errores: APAGADO. Falta SENTRY_DSN.',
  );

  const detener = async (senial: string): Promise<void> => {
    console.warn(`Recibida ${senial}, deteniendo el worker...`);
    await cola.stop({ graceful: true });
    await cerrarConexion();
    // Lo último: deja salir el error que tiró el proceso justo antes de
    // reiniciarse, que es el que más falta hace.
    await cerrarObservabilidad();
    process.exit(0);
  };

  process.on('SIGINT', () => void detener('SIGINT'));
  process.on('SIGTERM', () => void detener('SIGTERM'));
}

arrancar().catch((error: unknown) => {
  console.error('No se pudo arrancar el worker:', error);
  process.exit(1);
});
