# Arquitectura

## Panorama

Monorepo TypeScript con tres aplicaciones desplegables y cuatro paquetes compartidos.

```text
apps/frontend  Next.js App Router — sitio institucional, reserva y panel  → Vercel
apps/backend   NestJS REST + OpenAPI — dominio, pagos y panel              → Railway
apps/worker    Node + pg-boss — recordatorios, expiraciones y reintentos   → Railway
```

```text
packages/contratos      Esquemas Zod compartidos entre frontend, backend y worker
packages/base-datos     Esquemas Drizzle, migraciones, repositorios y semillas
packages/interfaz       Componentes y tokens visuales de la marca
packages/configuracion  Presets de TypeScript y ESLint
```

La orquestación de tareas es Turborepo; el gestor de paquetes es pnpm con workspaces.

## Reglas de dependencias

- `apps/*` puede depender de cualquier `packages/*`.
- `packages/*` nunca depende de `apps/*`.
- `packages/contratos` no depende de ningún otro paquete interno: es la base.
- `packages/interfaz` es la única que puede depender de React.
- El frontend nunca importa `@manly/base-datos`: habla con la API por HTTP.

## Convenciones de nombres

El dominio, el código propio, los comentarios, la base de datos y la documentación
están en español. Se conservan en inglés los nombres impuestos por herramientas o
proveedores externos:

- Archivos y carpetas de frameworks: `app/`, `page.tsx`, `layout.tsx`, `main.ts`,
  `app.module.ts`, `package.json`, `next.config.ts`.
- Nombres de tareas que las plataformas esperan por convención: `dev`, `build`,
  `start`, `lint`, `test`, `typecheck`. Vercel, Railway y Turborepo los detectan
  automáticamente; renombrarlos obliga a configurar cada plataforma a mano.
- Campos de APIs externas: `external_reference`, `preference_id`, etc.

Todo archivo propio que admita comentarios abre con una línea breve en español que
explica su responsabilidad. No se crean README por carpeta.

## Sistema visual

Todos los tokens viven en `packages/interfaz/src/tokens.css`, dentro de un bloque
`@theme` de Tailwind v4: color, tipografía, escala de texto, espaciado, radios y
movimiento. Ningún componente escribe un color, un tamaño ni una duración a mano.
Cambiar la identidad de la marca es cambiar ese archivo.

Las tipografías las inyecta `next/font` desde el layout raíz como las variables
`--fuente-titulo` y `--fuente-texto`, que los tokens consumen. Cambiar la
tipografía de la marca son dos declaraciones en `apps/frontend/src/app/layout.tsx`.

Los archivos se sirven desde el repositorio (`next/font/local`), no desde
`next/font/google`. Ese descarga las tipografías **durante el build**, así que un
corte de red, un proxy o un bloqueo de salida rompe el despliegue; ya falló acá de
forma intermitente. Con los woff2 versionados el build es reproducible y funciona
sin red.

La escala de texto y el espaciado de sección son fluidos (`clamp`): crecen con el
ancho de la ventana sin saltos. El diseño se hace primero a 360 px y se escala.

### Dos trampas que ya costaron caro

**Sintaxis de variables en Tailwind v4.** `py-[--spacing-seccion]` no resuelve la
variable: produce una declaración inválida y el estilo se pierde en silencio. Los
tokens declarados bajo un espacio de nombres de Tailwind generan su utilidad
directamente (`--spacing-seccion` → `py-seccion`, `--text-nota` → `text-nota`,
`--ease-manly` → `ease-manly`). Para una variable fuera de esos espacios, la
sintaxis es con paréntesis: `duration-(--duracion-rapida)`.

**tailwind-merge y los tokens propios.** `cn()` usa tailwind-merge, que no conoce
los tokens de la marca: sin configurarlo clasifica `text-nota` como color y lo
descarta al encontrar `text-grafito`, dejando el texto en el tamaño heredado. La
extensión está en `packages/interfaz/src/utilidades.ts` y hay pruebas que la
protegen. **Cada token nuevo de `--text-*` o `--color-*` tiene que sumarse a esas
dos listas**, o el token se va a perder sin ningún error visible.

## Motor de disponibilidad

Vive en `apps/backend/src/modulos/disponibilidad`. La carpeta `dominio/` es
lógica pura, sin base de datos ni Nest, y es donde están las reglas:

| Archivo          | Qué resuelve                                     |
| ---------------- | ------------------------------------------------ |
| `intervalos.ts`  | Álgebra de intervalos: unir, restar, intersectar |
| `calendario.ts`  | Horario local del negocio → instantes reales     |
| `itinerarios.ts` | Secuencias consecutivas con profesional asignado |

El servicio sólo trae los datos, llama al dominio y traduce al contrato.

### Dos ventanas por bloque

Cada bloque tiene la ventana que **ve el cliente** (la duración del servicio) y
la que **ocupa la agenda** (con la preparación y la limpieza). Se comparan
siempre las ocupadas: dos turnos pueden verse pegados para el cliente y ser
imposibles para un mismo profesional. Es la misma regla que hace cumplir el
`EXCLUDE` de la base, y las dos convenciones tienen que coincidir, incluido el
rango semiabierto `[)`.

### Orden de los servicios

El motor prueba las permutaciones del orden pedido, como exige el plan: si corte
y barba no entran en ese orden pero sí al revés, ofrece el horario. Devuelve una
sola opción por instante de comienzo — al cliente le sirve elegir un horario, no
ver todas las asignaciones internas posibles de ese mismo horario.

### Horario local y husos

La conversión de `"los jueves de 10 a 20"` a instantes se hace con Luxon, sobre
la fecha local completa. **Sumarle minutos a la medianoche no sirve**: sumar
duración cruza los saltos de horario de verano y el día del cambio el resultado
queda corrido una hora. Hay una prueba con un huso que sí aplica horario de
verano que fija ese comportamiento; Argentina hoy no lo usa, pero el motor no
debe asumirlo.

### Retención

Elegir una opción escribe la reserva y todos sus bloques en una transacción, con
`retencion_expira_en` a diez minutos. Si dos personas eligen el mismo horario a
la vez, ambas pasan la verificación previa en memoria y las dos intentan
escribir: la restricción de la base rechaza a la segunda, y el repositorio
traduce ese error a `HorarioNoDisponibleError`.

Los datos del cliente se piden **después** de retener, así que en `pendiente_pago`
pueden estar vacíos. Un CHECK los exige en `confirmada`, `completada` y `ausente`;
una retención abandonada expira sin haberlos tenido nunca.

El worker expira las retenciones vencidas cada minuto. Aun así, el motor ya
ignora las retenciones vencidas al calcular, de modo que un retraso del worker
nunca muestra como ocupado un horario que está libre.

## Flujo de reserva

Dos pasos a propósito: primero se **retiene** el horario elegido y recién después
se piden los datos del cliente. Nadie completa un formulario para enterarse al
final de que el turno ya no está.

```text
buscar → retener (10 min) → completar datos → confirmada
```

Sin seña la reserva queda confirmada de una. Con seña queda `pendiente_pago`
hasta que el webhook la confirme (Fase 6).

### El servidor no confía en el pedido

El cliente manda de vuelta la opción que eligió, pero **de ese pedido sólo se
usan los identificadores y los horarios**. Precios, duraciones, buffers y
ventanas ocupadas se recalculan contra la base, y se verifica que el profesional
preste ese servicio en esa sucursal, que los bloques vayan pegados y que todo
entre en el horario de atención.

Sin eso alcanzaría con editar la petición para reservarse un turno a precio cero,
con alguien que no hace ese servicio o fuera del horario del local. Hay pruebas
para cada uno de esos intentos.

### El token del enlace es una credencial

La gestión sin cuenta se hace con un enlace privado. Ese token **es** la
credencial, así que se trata como tal: 32 bytes de entropía, en la base queda
sólo el hash SHA-256, y el valor en claro se devuelve una única vez. La página se
marca `noindex`, se excluye en `robots.txt` y usa `referrer: no-referrer` para
que el token no se filtre por la cabecera Referer.

### Política de cambios

La anticipación mínima se resuelve con precedencia servicio → sucursal → global.
Entre varios servicios manda el más exigente, porque la reserva se cancela entera
o no se cancela.

Con anticipación suficiente el cambio es automático. Dentro del plazo se crea una
solicitud para gerencia y **el horario sigue ocupado**: liberarlo de inmediato y
después no poder devolver la seña sería peor. La reprogramación automática
reemplaza todos los bloques en una transacción, así que si el horario nuevo choca
el turno original queda intacto.

## Pagos

La seña se cobra con Checkout Pro. Manly **no recibe ni guarda datos de
tarjeta**: la persona los ingresa dentro del checkout de Mercado Pago.

### Dos reglas que gobiernan el módulo

**El webhook no se cree, se verifica.** La notificación sólo avisa que hay algo
nuevo que mirar; el estado real se consulta contra la pasarela antes de tocar
nada. Confiar en el cuerpo permitiría confirmar turnos sin pagar, porque el
endpoint es público.

**Procesar dos veces no confirma dos veces.** Las notificaciones llegan
repetidas de forma habitual. El registro es idempotente por
`pagos.id_pago_externo`, que tiene índice único, y sólo se confirma la reserva
cuando el pago pasa a aprobado _en esa llamada_.

### La firma es la única barrera

Antes de procesar nada se verifica la firma HMAC que manda Mercado Pago. Además
del hash, se comprueba que la marca de tiempo esté dentro de una ventana de
cinco minutos: sin eso, una notificación legítima capturada hoy podría
reenviarse dentro de un mes y seguiría validando.

El motivo del rechazo se registra pero nunca se responde: decirle a un atacante
qué parte falló le ahorra trabajo para el siguiente intento.

### La pasarela es una interfaz, no una dependencia

El módulo habla con `Pasarela`, no con Mercado Pago. Hay dos implementaciones:

|                       | Cuándo se usa                                             |
| --------------------- | --------------------------------------------------------- |
| `MercadoPagoPasarela` | Hay `MP_ACCESS_TOKEN`. Los tokens `TEST-` activan sandbox |
| `SimuladaPasarela`    | No hay token. Sirve una pantalla de checkout falsa        |

El arranque deja dicho en el registro cuál quedó activa, para que nadie descubra
por accidente que estuvo cobrando contra un simulador.

La simulada firma sus notificaciones con el mismo secreto y las procesa por el
mismo camino, así que lo que se ejercita es el flujo de producción y no un
atajo que sólo funciona en desarrollo.

### Cuando el webhook no llega

Es el camino normal, pero no es garantía: puede perderse, llegar tarde o
encontrar la API caída. Hay dos redes:

- La pantalla de vuelta consulta el estado cada pocos segundos mientras el pago
  siga sin resolverse, en vez de darlo por perdido.
- El worker revisa cada diez minutos los pagos que quedaron pendientes hace más
  de cinco minutos, dentro de una ventana de 48 horas.

Sin esto, alguien que pagó de verdad se quedaría sin turno y con el dinero
descontado.

### Reintegros

Nunca son automáticos. Los dispara gerencia y el contrato exige una confirmación
explícita. Cada movimiento queda como una fila propia —no se pisa el estado
anterior—, así que se puede reconstruir qué pasó con una reserva aunque haya
habido varios intentos, un cobro presencial y una devolución.

Si el reintegro por la pasarela falla, igual queda registrado para que alguien lo
resuelva a mano y no se pierda el rastro.

## Notificaciones

**Nada se envía en línea.** La API sólo escribe en la bandeja de salida; el
worker despacha. Dos razones: una caída de WhatsApp o de Resend no debe hacer
fallar una reserva, y sin registro persistente "no me llegó el recordatorio" es
imposible de investigar.

Los datos del mensaje se copian al encolar. Si mañana cambia un precio o el
nombre de un profesional, el recordatorio sigue diciendo lo que se le prometió.

### El estado `retenida`

Existe por un problema concreto: el enlace de gestión lleva un token que en la
base **sólo existe hasheado**, así que desde el webhook de pago no hay forma de
reconstruirlo.

La solución es preparar los avisos cuando sí se tiene el token —al completar los
datos del cliente— y dejarlos retenidos si falta pagar la seña. El pago los
libera; la expiración los descarta.

### Reintentos y respaldo

| Situación                                                  | Qué hace                                             |
| ---------------------------------------------------------- | ---------------------------------------------------- |
| Fallo pasajero (proveedor caído, 429, 5xx)                 | Reintenta a 1, 5 y 15 minutos                        |
| Fallo definitivo (número inexistente, plantilla rechazada) | No reintenta                                         |
| Datos corruptos                                            | No reintenta: es error del sistema, no del proveedor |
| Canal agotado y hay otro dato de contacto                  | Reencola por el otro canal                           |
| Los dos canales agotados                                   | Queda fallida, para la vista de fallos operativos    |

Insistir sobre un número que no existe sólo retrasa el aviso al local, por eso
la distinción entre pasajero y definitivo importa. Y el respaldo comprueba si ya
se intentó por el otro canal: sin eso, dos canales que fallan se reencolarían el
uno al otro indefinidamente.

### WhatsApp exige plantillas aprobadas

Fuera de una ventana de conversación de 24 horas, la Cloud API **no permite
texto libre**: hay que usar plantillas aprobadas por Meta con parámetros
numerados. Los avisos de turno siempre caen fuera de esa ventana.

Por eso `plantillas.ts` declara, por cada tipo, el nombre de la plantilla y el
orden exacto de sus parámetros. **Eso es un contrato con Meta**: cambiarlo exige
volver a pedir aprobación. Hay pruebas que fijan ese orden.

El email no tiene esa restricción y se arma libremente.

### Canales simulados

Cada canal se decide por separado según haya credenciales. Se puede tener email
real y WhatsApp simulado mientras se espera la aprobación de las plantillas, que
puede demorar semanas. El arranque avisa cuáles quedaron simulados.

## Base de datos

PostgreSQL administrado en Neon, accedido con Drizzle ORM.

**Dos cadenas de conexión, y no son intercambiables:**

| Variable               | Endpoint Neon | La usa                      |
| ---------------------- | ------------- | --------------------------- |
| `DATABASE_URL`         | Agrupado      | La API                      |
| `DATABASE_URL_DIRECTA` | Directo       | El worker y las migraciones |

`pg-boss` toma locks a nivel de sesión, y el endpoint agrupado de Neon (PgBouncer
en modo transacción) no los soporta: el worker debe usar siempre el directo. Las
migraciones también, porque el DDL toma locks propios.

Las fechas se guardan en UTC y se presentan en `America/Argentina/Buenos_Aires`.

### Cómo se impide la doble reserva

La integridad de la agenda no depende de que la aplicación verifique antes de
insertar: dos peticiones concurrentes pueden pasar ambas esa verificación. La
garantía está en la base.

`reservas_servicios` tiene una restricción `EXCLUDE USING gist` por profesional y
rango temporal. Si dos bloques del mismo profesional se pisan, el segundo INSERT
falla. Requiere la extensión `btree_gist`, que crea la propia migración.

Tres detalles que hacen que funcione:

- **Se compara la ventana ocupada, no la que ve el cliente.** Cada bloque guarda
  `comienza_en`/`termina_en` (lo que el cliente ve) y `ocupa_desde`/`ocupa_hasta`
  (con la preparación y la limpieza del servicio). Dos turnos pueden verse
  contiguos y aun así pisarse por los buffers.
- **El rango es `[)`.** Un bloque que termina 14:00 y otro que empieza 14:00 no se
  solapan.
- **El estado está desnormalizado en `reservas_servicios`.** Una restricción
  EXCLUDE sólo puede filtrar por columnas de su propia tabla, y la exclusión debe
  aplicar únicamente a los estados que ocupan la agenda (`pendiente_pago` y
  `confirmada`). Lo mantienen dos triggers: uno hereda el estado al insertar el
  bloque y otro lo propaga cuando cambia el de la reserva. **La aplicación nunca
  escribe esa columna.**

### Snapshots

`reservas_servicios` copia nombre, duración, precio y seña del servicio al momento
de reservar. Cambiar un precio después no altera las reservas ya tomadas.

### Pruebas del esquema

Corren sobre PGlite (PostgreSQL compilado a WebAssembly), así que no necesitan
Docker ni una base externa: `pnpm --filter @manly/base-datos test` levanta una base
efímera, le aplica las mismas migraciones que producción y verifica la exclusión,
los CHECK y la idempotencia. CI además aplica las migraciones contra un PostgreSQL
real, porque PGlite es una implementación distinta.

## El panel

Vive en `apps/backend/src/modulos` —`agenda`, `solicitudes`, `administracion`,
`usuarios`, `auditoria`— y en `apps/frontend/src/app/panel`.

### Protegido por omisión

`SesionGuardian` está registrado como `APP_GUARD`, es decir, guardián de toda la
aplicación. **Una ruta nueva queda protegida sin que nadie haga nada**: para
abrirla hay que marcarla con `@SinSesion()`. Al revés —proteger a mano cada
ruta— alcanza con olvidarse una vez para filtrar la agenda entera.

`@Roles('gerencia')` restringe lo que sólo administra el local. Las **lecturas**
del catálogo quedan abiertas a cualquier sesión porque el panel las necesita para
dibujar la agenda, y ahí no hay nada que esconder: los precios y los nombres
están publicados en el sitio.

### El recorte por rol lo hace el servidor

Quien tiene rol `profesional` ve sólo su columna, sin los datos de contacto del
cliente y sin los montos. El filtro sale de la sesión, **no del pedido**: si
saliera del pedido, cambiar un identificador en la URL alcanzaría para leer la
agenda de cualquiera. La guardia del navegador existe para no mostrar pantallas
vacías, no para proteger nada.

### Cargar un turno a mano usa el mismo camino que la web

`ReservasServicio.crearManual` reutiliza la misma validación de bloques: mismos
precios, mismos buffers, misma restricción de exclusión. Desde el panel tampoco
se puede pisar un turno ajeno ni inventar un horario fuera de la agenda. Lo único
que cambia es que se permite cargar un turno que ya empezó —alguien entró sin
aviso y se lo anota después— y que nace confirmado y sin seña.

### Un bloqueo no cancela turnos

Tapa la disponibilidad futura. Los turnos que quedaron adentro se devuelven al
crearlo para que gerencia los resuelva; borrárselos al cliente sin avisar sería
peor que el problema. Lo mismo vale para editar un horario semanal.

### El enlace de gestión se rota para avisar desde el panel

Un aviso al cliente lleva el enlace de su reserva, y ese enlace **no se puede
reconstruir**: en la base sólo vive su hash. Cuando el aviso lo origina el panel
—una cancelación, la resolución de una solicitud— se emite uno nuevo. El anterior
deja de funcionar, pero el nuevo viaja en el mismo mensaje.

### Auditoría

Toda modificación deja constancia con los valores de antes y de después. Escribir
en auditoría **nunca puede voltear la operación auditada**: si el registro falla,
la acción ya ocurrió y deshacerla sería peor que quedarse sin la constancia, así
que el error se traga y queda en el log del proceso.

## Estado de implementación

Fases 1 a 8 completas: fundación, identidad, modelo de datos, motor de
disponibilidad, sitio público y flujo de reserva, pagos, notificaciones y panel
interno. Pagos y notificaciones corren contra adaptadores simulados hasta que
haya credenciales reales. Quedan las fases 9 (calidad y seguridad) y 10 (staging
y lanzamiento).
