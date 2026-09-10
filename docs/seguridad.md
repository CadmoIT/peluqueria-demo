# Seguridad

Qué defiende qué, y por qué cada número es el que es. Está escrito para que
nadie afloje una de estas piezas sin saber qué deja abierto: casi todas fallan
en silencio, y ninguna avisa cuando se rompe.

## Lo que protege cada cosa

| Qué se protege             | Con qué                                 | Si se cae                                         |
| -------------------------- | --------------------------------------- | ------------------------------------------------- |
| Entrada al panel           | Argon2id + límite de 10 por minuto      | Se prueba un diccionario en una noche             |
| Sesión del panel           | Cookie `httpOnly`, `sameSite: lax`      | Un XSS se lleva la sesión; otro sitio la usa      |
| Enlace de gestión          | 32 bytes aleatorios, guardado como hash | Se adivina o se lee de la base                    |
| Agenda de cada profesional | Rol resuelto en el servidor             | Cambiando un id en la URL se lee la agenda ajena  |
| Webhook de pagos           | Firma HMAC con ventana de 5 minutos     | Se confirman reservas sin pagarlas                |
| Agenda contra el abuso     | Límite de 15 retenciones por hora       | Un script bloquea el día entero sin pagar un peso |
| Datos de los clientes      | Recorte por rol en la respuesta         | Cualquiera con sesión ve teléfonos y correos      |

## Límite de peticiones

Vive en `apps/backend/src/comun/limite-peticiones.ts`. Tres niveles:

- **General: 120 por minuto.** Nadie consulta disponibilidad más de dos veces
  por segundo de forma sostenida.
- **Acceso: 10 por minuto**, en las cuatro rutas que verifican credenciales.
  Argon2id ya hace lenta cada verificación, pero nada impide seguir probando;
  esto es lo que convierte "probar un diccionario" en algo inviable.
- **Reserva: 15 por hora**, al retener horarios. Retener no cuesta nada y
  bloquea diez minutos de agenda.

El **webhook de pagos queda exento**. Mercado Pago reintenta con insistencia y
un 429 ahí significa que una reserva pagada no se confirma nunca. Lo que lo
protege es la firma: un cuerpo sin firma válida se rechaza antes de tocar la
base.

El conteo es por dirección de origen, leída de `x-forwarded-for`. En producción
hay un proxy adelante, así que `main.ts` activa `trust proxy`; **sin eso todo el
tráfico caería en el mismo balde y un solo abusador dejaría afuera a todos**.
Fuera de producción no se confía en esa cabecera, porque sin un proxy adelante
cualquiera la falsifica.

## Contraseñas y tokens

Las contraseñas van con **Argon2id** con los parámetros que recomienda OWASP
(19 MiB, dos pasadas, sin paralelismo). La sal va adentro del hash.

Los tokens —sesión, invitación, recuperación, enlace de gestión— son **32 bytes
aleatorios guardados como hash SHA-256**. No se firman ni se cifran, así que no
hay clave que rotar ni que filtrar: por eso no existe ningún `SECRETO_SESION` en
la configuración. Un volcado de la base no alcanza para usar ninguno.

La consecuencia práctica: **el token en claro existe una sola vez**, en la
respuesta que lo emite. Cuando el panel necesita mandar un aviso que lleva el
enlace de gestión, no puede reconstruirlo y emite uno nuevo.

## Sesiones

Cookie `httpOnly` —el JavaScript de la página no puede leerla, así que un XSS no
alcanza para robarla—, `sameSite: lax` —otro sitio no la usa en peticiones de
escritura— y `secure` fuera de desarrollo.

Duran 14 días. Cambiar la contraseña cierra las demás: si alguien la cambió
porque sospecha que se la robaron, dejar viva la sesión del intruso no serviría
de nada. Dar de baja a una persona también le corta el acceso en el acto.

## Permisos

El guardián de sesión es **global**: una ruta nueva queda protegida sin que nadie
haga nada, y para abrirla hay que marcarla con `@SinSesion()`. Al revés —proteger
a mano cada ruta— alcanza con olvidarse una vez.

El recorte por rol **lo hace el servidor**. Quien tiene rol `profesional` ve sólo
su columna, sin datos de contacto ni montos, y el filtro sale de la sesión y no
del pedido: si saliera del pedido, cambiar un identificador en la URL alcanzaría
para leer la agenda de cualquiera. La guardia del navegador existe para no
mostrar pantallas vacías, no para proteger nada.

## Validación de entradas

Todo cuerpo se valida con los esquemas Zod de `@manly/contratos`, los mismos que
usa la web. Los identificadores de ruta pasan por `UuidTuberia`, que responde
**404 y no 400**: un identificador imposible y uno que no existe no se
distinguen, y esa indistinción evita que se pueda sondear cuáles existen.

Nada de lo que manda el cliente se toma como verdad. Precios, duraciones,
buffers y ventanas ocupadas se recalculan contra la base; del pedido sólo se
usan los identificadores y los horarios elegidos.

## Lo que la base no deja pasar

La última barrera no es de la aplicación. `reservas_servicios` tiene una
restricción `EXCLUDE USING gist` que impide dos bloques solapados del mismo
profesional. Dos peticiones simultáneas pasan las dos la comprobación en
memoria; la que llega segunda la rechaza PostgreSQL.

## Cabeceras

La API las manda con helmet (HSTS, `X-Content-Type-Options`, y una política de
contenido restrictiva). La web agrega `X-Content-Type-Options`,
`X-Frame-Options: SAMEORIGIN` y `Referrer-Policy: strict-origin-when-cross-origin`
en `next.config.ts`; esta última importa porque **el enlace privado de gestión
viaja en la URL** y sin ella se filtraría en el `Referer` al salir del sitio.

La web **todavía no manda una política de contenido propia**. Una CSP mal armada
rompe el sitio de formas difíciles de detectar, así que merece encenderse contra
staging y no a ciegas. Queda pendiente para la fase 10.

## Lo que el arranque no perdona

En producción la API **no arranca** si:

- `MP_SECRETO_WEBHOOK` sigue en el valor de desarrollo — cualquiera que lea el
  repositorio podría firmar un pago.
- Falta `MP_ACCESS_TOKEN` — se activaría la pasarela simulada, que aprueba todo,
  y los turnos saldrían gratis sin que nadie se entere hasta cerrar la caja.
- `NEXT_PUBLIC_URL_PUBLICA`, `URL_PUBLICA_API` u `ORIGENES_PERMITIDOS` apuntan a
  localhost — los enlaces que se le mandan a la gente no llevarían a ningún lado.

Las tres se juntan en un solo error, para no perder una tarde arreglándolas de a
una. La documentación OpenAPI tampoco se publica en producción.

## Dependencias

CI corre `pnpm audit --prod` en un trabajo aparte que **no bloquea**: una
vulnerabilidad nueva en una dependencia transitiva aparece cualquier martes sin
que nadie haya tocado nada, y frenar los despliegues por eso hace que el paso se
termine ignorando. Queda en el registro para que alguien lo mire.

Estado al cerrar la fase 9:

- **Corregido:** `drizzle-orm` tenía una inyección SQL por identificadores mal
  escapados (alta). Se subió de 0.38.4 a 0.45.2, con drizzle-kit a la par. Las
  325 pruebas pasan sin cambios de código.
- **Aceptado por ahora:** `@nestjs/core` y el grupo que arrastra Express
  —`multer`, `qs`, `body-parser`, `ajv`— sólo se corrigen subiendo a NestJS 11,
  que trae Express 5. Es una migración con su propio riesgo y merece un pase
  dedicado, no la cola de otra fase. Ninguna de las cuatro es alcanzable acá:
  no se suben archivos (multer), no se arma ninguna cadena de consulta con
  entrada del cliente (qs) y los límites del cuerpo no son configurables desde
  afuera (body-parser).
- **De herramientas:** `glob`, `lodash`, `js-yaml`, `picomatch`, `postcss`,
  `webpack` y `tmp` entran por Next, el CLI de Nest y drizzle-kit. No corren en
  producción.

## Qué falta

- Política de contenido en la web.
- Subir a NestJS 11, que cierra cinco advertencias de una.
- Rotación de credenciales documentada como procedimiento.
