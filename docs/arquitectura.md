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

La integridad de la agenda se apoya en una restricción `EXCLUDE` de PostgreSQL por
profesional y rango temporal sobre los estados activos, que impide dobles reservas
incluso con peticiones concurrentes. Requiere la extensión `btree_gist`, que se
crea en `infraestructura/inicializacion/01-extensiones.sql`.

## Estado de implementación

La Fase 1 (fundación) está completa: monorepo, configuraciones compartidas,
esqueletos de las tres aplicaciones, PostgreSQL local, plantilla de entorno y CI.
El modelo de datos, el motor de disponibilidad, los pagos, las notificaciones y el
panel corresponden a las fases 3 a 8 del plan.
