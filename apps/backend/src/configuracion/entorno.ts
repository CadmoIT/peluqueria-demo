// Valida y tipa las variables de entorno de la API al arrancar el proceso.
// Si falta algo obligatorio el arranque falla de inmediato, no en la primera petición.
import { z } from 'zod';

const esquemaEntorno = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PUERTO: z.coerce.number().int().positive().default(3001),
  API_PREFIJO: z.string().default('api/v1'),
  ORIGENES_PERMITIDOS: z.string().default('http://localhost:3000'),
  ZONA_HORARIA: z.string().default('America/Argentina/Buenos_Aires'),

  // La API usa la conexión agrupada; el worker usa DATABASE_URL_DIRECTA.
  DATABASE_URL: z.string().min(1, 'Falta la cadena de conexión a PostgreSQL.'),

  SECRETO_SESION: z.string().min(32).optional(),
  SECRETO_TOKEN_RESERVA: z.string().min(32).optional(),

  // ── Web y pagos ──────────────────────────────────────────────────────────
  NEXT_PUBLIC_URL_PUBLICA: z.string().default('http://localhost:3000'),
  /** URL desde la que la pasarela alcanza esta API para notificar. */
  URL_PUBLICA_API: z.string().default('http://localhost:3001/api/v1'),

  /** Sin token se usa la pasarela simulada y no se cobra dinero real. */
  MP_ACCESS_TOKEN: z.string().optional(),
  MP_SECRETO_WEBHOOK: z.string().default('secreto-de-desarrollo'),

  SENTRY_DSN: z.string().optional(),
});

export type Entorno = z.infer<typeof esquemaEntorno>;

export function validarEntorno(fuente: Record<string, unknown>): Entorno {
  const resultado = esquemaEntorno.safeParse(fuente);

  if (!resultado.success) {
    const detalle = resultado.error.issues
      .map((problema) => `  - ${problema.path.join('.')}: ${problema.message}`)
      .join('\n');

    throw new Error(`Variables de entorno inválidas:\n${detalle}`);
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
