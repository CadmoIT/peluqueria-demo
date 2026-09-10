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

## Estado de implementación

La Fase 1 (fundación) está completa: monorepo, configuraciones compartidas,
esqueletos de las tres aplicaciones, PostgreSQL local, plantilla de entorno y CI.
El modelo de datos, el motor de disponibilidad, los pagos, las notificaciones y el
panel corresponden a las fases 3 a 8 del plan.
