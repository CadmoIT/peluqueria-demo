// Valida las variables de entorno del worker antes de conectar con la cola.
import { z } from 'zod';

const esquemaEntorno = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ZONA_HORARIA: z.string().default('America/Argentina/Buenos_Aires'),

  // pg-boss necesita locks a nivel de sesión, que el pooler de Neon
  // (PgBouncer en modo transacción) no soporta: siempre la conexión directa.
  DATABASE_URL_DIRECTA: z.string().min(1, 'El worker requiere la conexión directa a PostgreSQL.'),

  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_ID_TELEFONO: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_REMITENTE: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
});

export type Entorno = z.infer<typeof esquemaEntorno>;

export function leerEntorno(fuente: NodeJS.ProcessEnv = process.env): Entorno {
  const resultado = esquemaEntorno.safeParse(fuente);

  if (!resultado.success) {
    const detalle = resultado.error.issues
      .map((problema) => `  - ${problema.path.join('.')}: ${problema.message}`)
      .join('\n');

    throw new Error(`Variables de entorno inválidas:\n${detalle}`);
  }

  return resultado.data;
}
