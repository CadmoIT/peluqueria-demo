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

## Variables que bloquean el arranque

En producción la API se niega a arrancar con la configuración de desarrollo.
Antes de desplegar tienen que estar cargadas:

| Variable                  | Por qué se exige                                               |
| ------------------------- | -------------------------------------------------------------- |
| `MP_ACCESS_TOKEN`         | Sin él se activa la pasarela simulada, que aprueba todo        |
| `MP_SECRETO_WEBHOOK`      | Con el valor por defecto, cualquiera puede firmar un pago      |
| `NEXT_PUBLIC_URL_PUBLICA` | Va en los enlaces que se le mandan a los clientes              |
| `URL_PUBLICA_API`         | Es la dirección a la que Mercado Pago manda las notificaciones |
| `ORIGENES_PERMITIDOS`     | Sin el dominio real, el sitio no puede hablarle a la API       |

`SENTRY_DSN` (API y worker) y `NEXT_PUBLIC_SENTRY_DSN` (web) no bloquean el
arranque, pero sin ellos nadie se entera de los errores: el arranque lo deja
dicho en el registro con un `Reporte de errores: APAGADO`.

Las faltas se informan todas juntas en un solo error. Ver
[seguridad.md](seguridad.md) para el detalle de qué deja abierto cada una.

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

## Recuperación

El respaldo es la única defensa contra un error que ya se escribió en la base:
una migración que borró de más, un `DELETE` sin `WHERE`, una corrupción.

Neon mantiene **restauración a un punto en el tiempo**. El procedimiento:

1. Cortar el tráfico de escritura: bajar el worker y poner la API en
   mantenimiento. Restaurar con la aplicación escribiendo deja la base a mitad
   de camino entre dos momentos.
2. Crear una **rama nueva** desde el instante anterior al problema. Nunca se
   restaura encima de la principal: si el instante elegido resulta ser el
   equivocado, sobre la rama se prueba de nuevo y sobre la principal no.
3. Verificar sobre la rama que los datos son los esperados: la última reserva,
   el último pago, la última fila de auditoría.
4. Recién entonces promover la rama y volver a levantar los servicios.

Lo que se pierde es todo lo escrito entre el instante elegido y el corte. Antes
de promover conviene anotar qué quedó afuera —reservas, pagos, notificaciones—
para resolverlo a mano: `auditoria` y la bandeja de salida sirven justamente
para reconstruir eso.

**Un respaldo que nunca se restauró no es un respaldo.** La prueba de
restauración se corre antes de cada migración de producción, no cuando hace
falta de verdad.

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
