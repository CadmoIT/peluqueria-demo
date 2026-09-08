# Despliegue

## Entornos

| Entorno    | Web            | API / Worker   | Base de datos    |
| ---------- | -------------- | -------------- | ---------------- |
| Desarrollo | localhost:3000 | localhost:3001 | Docker local     |
| Staging    | Vercel         | Railway        | Neon (rama)      |
| Producción | Vercel         | Railway        | Neon (principal) |

Cada entorno tiene su propia base y su propio juego de secretos. Ninguno comparte
credenciales con otro.

## Web (Vercel)

- Directorio raíz: `apps/frontend`
- Comando de build: `pnpm build`
- Comando de instalación: `pnpm install --frozen-lockfile`
- Variables: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_URL_PUBLICA`, `NEXT_PUBLIC_SENTRY_DSN`

Sólo las variables con prefijo `NEXT_PUBLIC_` llegan al navegador. Cualquier secreto
real va del lado de la API.

## API y worker (Railway)

Dos servicios separados desde el mismo repositorio.

| Servicio | Directorio     | Arranque     | Conexión                  |
| -------- | -------------- | ------------ | ------------------------- |
| API      | `apps/backend` | `pnpm start` | `DATABASE_URL` (agrupada) |
| Worker   | `apps/worker`  | `pnpm start` | `DATABASE_URL_DIRECTA`    |

El worker con la conexión agrupada arranca pero falla de forma intermitente: pg-boss
necesita locks de sesión que PgBouncer en modo transacción no mantiene.

## Migraciones

Se aplican como paso explícito antes de activar la versión nueva, nunca al arrancar
el proceso: dos instancias arrancando a la vez migrarían en paralelo.

```bash
pnpm bd:migrar
```

Orden de un despliegue con cambio de esquema:

1. Respaldo de la base.
2. Migración compatible hacia atrás (la versión vieja tiene que seguir funcionando).
3. Despliegue de API y worker.
4. Despliegue de la web.
5. Verificación de `/api/v1/salud` y de una reserva de prueba.

## Rollback

- **Web y API:** revertir al despliegue anterior desde Vercel o Railway.
- **Base de datos:** las migraciones no se revierten automáticamente. Por eso cada
  cambio de esquema tiene que ser compatible hacia atrás: se puede volver el código
  sin tocar la base. Si hay que revertir el esquema, es restauración desde respaldo
  y se pierde lo escrito desde ese punto.

## Verificación posterior

- `/api/v1/salud` responde `operativo`.
- Una reserva de prueba completa el flujo hasta la confirmación.
- El webhook de Mercado Pago llega y valida su firma.
- Sentry no muestra errores nuevos.
- El worker registró sus trabajos recurrentes.

## Corte de AgendaPro

No hay integración ni migración. Se define una fecha de corte, se cierran las nuevas
reservas en AgendaPro, se activan los CTA del sitio nuevo y Manly resuelve
operativamente los turnos anteriores al corte.
