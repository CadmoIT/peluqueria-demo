// Señales de que el sistema está haciendo su trabajo.
//
// No mide si los procesos están vivos, mide si **el trabajo se está haciendo**.
// Es una diferencia que importa: un worker levantado que dejó de tomar de la
// cola responde a cualquier ping y no manda un solo aviso. Lo que delata eso no
// es un latido sino la antigüedad de lo que quedó sin hacer.
//
// Cada consulta de acá responde a una pregunta concreta que alguien se hace
// mirando el panel un lunes a la mañana: ¿salieron los recordatorios?, ¿se
// liberaron los horarios que nadie pagó?, ¿hay alguien esperando un aviso que
// no le va a llegar?
import { and, eq, isNotNull, lt, sql } from 'drizzle-orm';

import type { BaseDatos } from '../conexion';
import { estadoWorker, notificaciones, reservas } from '../esquemas/index';

export interface SenalesDelSistema {
  /** Avisos que ya deberían haber salido y siguen esperando. */
  notificacionesVencidas: number;
  /**
   * Hace cuántos minutos venció el aviso más viejo que sigue sin salir.
   *
   * Es la señal principal de que el despachador se cayó: corre cada cinco
   * minutos, así que un atraso de más de quince es un problema.
   */
  atrasoDespachoMinutos: number | null;
  /** Avisos que agotaron sus reintentos. Alguien tiene que levantar el teléfono. */
  notificacionesFallidas: number;
  /** Avisos esperando que se acredite un pago. */
  notificacionesRetenidas: number;
  /**
   * Retenciones vencidas que siguen ocupando la agenda.
   *
   * El expirador corre cada minuto. Si esto es mayor que cero por más de un
   * par de minutos, hay horarios bloqueados que nadie va a usar.
   */
  retencionesSinExpirar: number;
  /** Reservas con seña esperando la confirmación del pago. */
  pagosSinConciliar: number;
  /** Turnos confirmados de hoy en adelante. Sirve para ver que hay actividad. */
  reservasProximas: number;
}

export async function senalesDelSistema(bd: BaseDatos): Promise<SenalesDelSistema> {
  const [fila] = await bd
    .select({
      notificacionesVencidas: sql<number>`
        count(*) filter (
          where ${notificaciones.estado} = 'pendiente'
            and ${notificaciones.programadaPara} <= now()
        )::int
      `,
      atrasoSegundos: sql<number | null>`
        extract(epoch from (now() - min(${notificaciones.programadaPara}) filter (
          where ${notificaciones.estado} = 'pendiente'
            and ${notificaciones.programadaPara} <= now()
        )))::int
      `,
      fallidas: sql<number>`count(*) filter (where ${notificaciones.estado} = 'fallida')::int`,
      retenidas: sql<number>`count(*) filter (where ${notificaciones.estado} = 'retenida')::int`,
    })
    .from(notificaciones);

  const [retenciones] = await bd
    .select({ total: sql<number>`count(*)::int` })
    .from(reservas)
    .where(
      and(
        eq(reservas.estado, 'pendiente_pago'),
        isNotNull(reservas.retencionExpiraEn),
        lt(reservas.retencionExpiraEn, sql`now()`),
      ),
    );

  const [pendientesDePago] = await bd
    .select({ total: sql<number>`count(*)::int` })
    .from(reservas)
    .where(and(eq(reservas.estado, 'pendiente_pago'), sql`${reservas.seniaTotalCentavos} > 0`));

  const [proximas] = await bd
    .select({ total: sql<number>`count(*)::int` })
    .from(reservas)
    .where(and(eq(reservas.estado, 'confirmada'), sql`${reservas.comienzaEn} >= now()`));

  const atraso = fila?.atrasoSegundos ?? null;

  return {
    notificacionesVencidas: fila?.notificacionesVencidas ?? 0,
    atrasoDespachoMinutos: atraso === null ? null : Math.floor(atraso / 60),
    notificacionesFallidas: fila?.fallidas ?? 0,
    notificacionesRetenidas: fila?.retenidas ?? 0,
    retencionesSinExpirar: retenciones?.total ?? 0,
    pagosSinConciliar: pendientesDePago?.total ?? 0,
    reservasProximas: proximas?.total ?? 0,
  };
}

/**
 * Comprueba que la base responda, y cuánto tarda.
 *
 * `select 1` y no una consulta de las tablas: lo que se quiere saber es si hay
 * conexión, no si los datos están bien. Una consulta pesada en el chequeo de
 * salud convierte un pico de carga en una caída.
 */
export async function latenciaBaseDatos(bd: BaseDatos): Promise<number> {
  const comienzo = Date.now();

  await bd.execute(sql`select 1`);

  return Date.now() - comienzo;
}

// ── Latido del worker ────────────────────────────────────────────────────────

export interface LatidoWorker {
  ultimaCorrida: Date;
  canalWhatsapp: 'real' | 'simulado';
  canalEmail: 'real' | 'simulado';
  version: string | null;
}

/**
 * Deja constancia de que el worker corrió, y con qué configuración.
 *
 * Se llama en cada pasada del despachador. La fila es una sola: no interesa el
 * historial, interesa lo último.
 */
export async function registrarLatido(
  bd: BaseDatos,
  datos: { canalWhatsapp: 'real' | 'simulado'; canalEmail: 'real' | 'simulado'; version?: string },
): Promise<void> {
  const valores = {
    ultimaCorrida: new Date(),
    canalWhatsapp: datos.canalWhatsapp,
    canalEmail: datos.canalEmail,
    version: datos.version ?? null,
  };

  const actualizadas = await bd
    .update(estadoWorker)
    .set(valores)
    .where(eq(estadoWorker.filaUnica, true))
    .returning({ id: estadoWorker.id });

  if (actualizadas.length === 0) {
    // Primera corrida del entorno. El índice único sobre `fila_unica` impide
    // que dos instancias arrancando a la vez inserten dos filas.
    await bd.insert(estadoWorker).values(valores).onConflictDoNothing();
  }
}

/** Lo último que dijo el worker, o null si nunca corrió. */
export async function ultimoLatido(bd: BaseDatos): Promise<LatidoWorker | null> {
  const [fila] = await bd
    .select({
      ultimaCorrida: estadoWorker.ultimaCorrida,
      canalWhatsapp: estadoWorker.canalWhatsapp,
      canalEmail: estadoWorker.canalEmail,
      version: estadoWorker.version,
    })
    .from(estadoWorker)
    .limit(1);

  return fila ? (fila as LatidoWorker) : null;
}
