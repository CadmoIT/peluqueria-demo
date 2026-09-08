# Manly

Plataforma web y de reservas de Manly: sitio institucional, reserva de turnos
multiservicio sin cuenta, seña por Mercado Pago, notificaciones por WhatsApp o
email, y panel para gerencia y profesionales.

## Estructura

```text
manly/
├─ apps/
│  ├─ frontend/  Next.js — sitio, reserva y panel
│  ├─ backend/   NestJS — API REST y OpenAPI
│  └─ worker/    Node + pg-boss — recordatorios y expiraciones
├─ packages/
│  ├─ contratos/      Esquemas Zod compartidos
│  ├─ base-datos/     Drizzle: esquemas, migraciones y semillas
│  ├─ interfaz/       Componentes y tokens de marca
│  └─ configuracion/  Presets de TypeScript y ESLint
├─ docs/
└─ infraestructura/
```

## Arranque rápido

```bash
pnpm install
cp .env.example .env
docker compose -f infraestructura/docker-compose.yml up -d
pnpm dev
```

Web en http://localhost:3000, API en http://localhost:3001/api/v1.

Requiere Node 24 y pnpm 12. Los detalles están en
[docs/operaciones.md](docs/operaciones.md).

## Documentación

| Documento                                   | Contenido                                |
| ------------------------------------------- | ---------------------------------------- |
| [arquitectura.md](docs/arquitectura.md)     | Estructura, dependencias y convenciones  |
| [reglas-negocio.md](docs/reglas-negocio.md) | Reservas, pagos, cambios y permisos      |
| [operaciones.md](docs/operaciones.md)       | Desarrollo local, tareas y base de datos |
| [despliegue.md](docs/despliegue.md)         | Entornos, migraciones y rollback         |
| [guia-imagenes.md](docs/guia-imagenes.md)   | Nombres, formatos y proporciones         |

## Estado

Fase 1 (fundación) completa. Las fases 2 a 10 —identidad, modelo de datos, motor de
disponibilidad, sitio público, pagos, notificaciones, panel, seguridad y lanzamiento—
están pendientes.
