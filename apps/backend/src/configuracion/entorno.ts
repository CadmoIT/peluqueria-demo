// Valida y tipa las variables de entorno de la API al arrancar el proceso.
// Si falta algo obligatorio el arranque falla de inmediato, no en la primera petición.
import { z } from 'zod';

/**
 * Secreto de firma del webhook para desarrollo.
 *
 * Está a la vista a propósito: en desarrollo la pasarela es simulada y no hay
 * dinero de por medio. En producción el arranque falla si sigue siendo éste.
 */
const SECRETO_DE_DESARROLLO = 'secreto-de-desarrollo';

const esquemaEntorno = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PUERTO: z.coerce.number().int().positive().default(3001),
  API_PREFIJO: z.string().default('api/v1'),
  ORIGENES_PERMITIDOS: z.string().default('http://localhost:3000'),
  ZONA_HORARIA: z.string().default('America/Argentina/Buenos_Aires'),

  // La API usa la conexión agrupada; el worker usa DATABASE_URL_DIRECTA.
  DATABASE_URL: z.string().min(1, 'Falta la cadena de conexión a PostgreSQL.'),

  // ── Web y pagos ──────────────────────────────────────────────────────────
  NEXT_PUBLIC_URL_PUBLICA: z.string().default('http://localhost:3000'),
  /** URL desde la que la pasarela alcanza esta API para notificar. */
  URL_PUBLICA_API: z.string().default('http://localhost:3001/api/v1'),

  /** Sin token se usa la pasarela simulada y no se cobra dinero real. */
  MP_ACCESS_TOKEN: z.string().optional(),
  MP_SECRETO_WEBHOOK: z.string().default(SECRETO_DE_DESARROLLO),

  SENTRY_DSN: z.string().optional(),
});

export type Entorno = z.infer<typeof esquemaEntorno>;

/**
 * Comprobaciones que sólo rigen en producción.
 *
 * Los valores por defecto del esquema existen para que `pnpm dev` arranque sin
 * configurar nada. En producción cada uno de ellos es un agujero:
 *
 *   - Con el secreto del webhook por defecto, **cualquiera que lea el
 *     repositorio puede falsificar la firma** de un pago y confirmar reservas
 *     sin pagarlas.
 *   - Sin `MP_ACCESS_TOKEN` se activa la pasarela simulada, que aprueba todo.
 *     Un despliegue así regalaría los turnos sin que nadie se entere hasta
 *     cerrar la caja.
 *   - Con las URL en localhost, los enlaces de gestión y de invitación que se
 *     mandan a la gente no llevan a ningún lado.
 *   - Con los orígenes en localhost, el sitio real no puede hablarle a la API.
 *
 * Fallar al arrancar es incómodo. Descubrir cualquiera de estos en producción
 * es mucho peor, y siempre se descubre tarde.
 */
function exigirProduccion(entorno: Entorno): string[] {
  if (entorno.NODE_ENV !== 'production') return [];

  const faltas: string[] = [];

  if (entorno.MP_SECRETO_WEBHOOK === SECRETO_DE_DESARROLLO) {
    faltas.push('MP_SECRETO_WEBHOOK sigue en el valor de desarrollo.');
  }

  if (!entorno.MP_ACCESS_TOKEN) {
    faltas.push('MP_ACCESS_TOKEN falta: se activaría la pasarela simulada, que aprueba todo.');
  }

  for (const clave of [
    'NEXT_PUBLIC_URL_PUBLICA',
    'URL_PUBLICA_API',
    'ORIGENES_PERMITIDOS',
  ] as const) {
    if (entorno[clave].includes('localhost')) {
      faltas.push(`${clave} apunta a localhost.`);
    }
  }

  return faltas;
}

export function validarEntorno(fuente: Record<string, unknown>): Entorno {
  const resultado = esquemaEntorno.safeParse(fuente);

  if (!resultado.success) {
    const detalle = resultado.error.issues
      .map((problema) => `  - ${problema.path.join('.')}: ${problema.message}`)
      .join('\n');

    throw new Error(`Variables de entorno inválidas:\n${detalle}`);
  }

  const faltas = exigirProduccion(resultado.data);

  if (faltas.length > 0) {
    const lista = faltas.map((falta) => `  - ${falta}`).join('\n');

    throw new Error(`Configuración inválida para producción:\n${lista}`);
  }

  return resultado.data;
}

/** Convierte la lista separada por comas de ORIGENES_PERMITIDOS en un arreglo. */
export function origenesPermitidos(lista: string): string[] {
  return lista
    .split(',')
    .map((origen) => origen.trim())
    .filter(Boolean);
}
