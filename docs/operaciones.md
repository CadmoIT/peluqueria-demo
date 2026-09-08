# Operaciones

## Requisitos

- Node 24 (ver `.nvmrc`)
- pnpm 12 (`npm i -g pnpm` o `corepack pnpm`)
- Docker, para levantar PostgreSQL local

## Puesta en marcha

```bash
pnpm install
cp .env.example .env
docker compose -f infraestructura/docker-compose.yml up -d
pnpm bd:migrar
pnpm dev
```

`pnpm dev` levanta las tres aplicaciones en paralelo:

| Aplicación | URL                                        |
| ---------- | ------------------------------------------ |
| Web        | http://localhost:3000                      |
| API        | http://localhost:3001/api/v1               |
| OpenAPI    | http://localhost:3001/api/v1/documentacion |
| Salud      | http://localhost:3001/api/v1/salud         |

Generar los secretos de `.env` con:

```bash
openssl rand -base64 48
```

## Tareas

| Comando                  | Qué hace                                         |
| ------------------------ | ------------------------------------------------ |
| `pnpm dev`               | Levanta web, API y worker                        |
| `pnpm build`             | Compila todo respetando el grafo de dependencias |
| `pnpm lint`              | ESLint en todos los paquetes                     |
| `pnpm typecheck`         | Verificación de tipos                            |
| `pnpm test`              | Pruebas unitarias                                |
| `pnpm formato`           | Aplica Prettier                                  |
| `pnpm formato:verificar` | Verifica formato sin escribir (lo usa CI)        |
| `pnpm bd:generar`        | Genera una migración a partir de los esquemas    |
| `pnpm bd:migrar`         | Aplica las migraciones pendientes                |
| `pnpm bd:semillas`       | Carga datos iniciales de desarrollo              |

## Nota para Windows

pnpm instala con `node-linker=hoisted` (ver `.npmrc`) porque Windows restringe la
creación de symlinks salvo con Modo Desarrollador activado o permisos de
administrador. Activando el Modo Desarrollador en _Configuración → Sistema → Para
desarrolladores_ se puede quitar esa línea y recuperar el aislamiento estricto de
dependencias que da pnpm por defecto.

## Vitest en los paquetes

Todo paquete que declare `vitest` tiene que declarar también `@types/node`. Vitest
lo tiene como peer opcional y, sin él, pnpm resuelve una variante del paquete que
con `node-linker=hoisted` queda como un enlace roto: el binario no se instala y el
script `test` falla con "vitest no se reconoce como un comando".

## Base de datos

`DATABASE_URL` (agrupada) es para la API. `DATABASE_URL_DIRECTA` es para el worker
y las migraciones, y **no son intercambiables**: pg-boss y el DDL necesitan locks de
sesión que el pooler de Neon no soporta. En local ambas apuntan al mismo PostgreSQL.

## Bandeja de salida

Las notificaciones no se envían en línea: se encolan y las despacha el worker con
reintentos. Si un envío agota los reintentos queda marcado como fallido y se alerta
a gerencia. La vista de fallos operativos del panel (Fase 8) es el lugar donde se
revisan.

## Respaldos

Neon mantiene restauración a un punto en el tiempo. Antes de cada migración de
producción se toma un respaldo explícito y se verifica que la restauración funcione;
un respaldo que nunca se probó no es un respaldo.
