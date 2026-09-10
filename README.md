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

| Documento                                   | Contenido                                      |
| ------------------------------------------- | ---------------------------------------------- |
| [arquitectura.md](docs/arquitectura.md)     | Estructura, dependencias y convenciones        |
| [reglas-negocio.md](docs/reglas-negocio.md) | Reservas, pagos, cambios y permisos            |
| [operaciones.md](docs/operaciones.md)       | Desarrollo local, tareas y base de datos       |
| [despliegue.md](docs/despliegue.md)         | Entornos, migraciones, rollback y recuperación |
| [seguridad.md](docs/seguridad.md)           | Qué defiende qué, y por qué                    |
| [guia-imagenes.md](docs/guia-imagenes.md)   | Nombres, formatos y proporciones               |

## Estado

Fases 1 a 9 completas: fundación, identidad, modelo de datos, motor de
disponibilidad, sitio público y flujo de reserva, pagos, notificaciones, panel
interno, y calidad y seguridad.

Pagos y notificaciones corren contra adaptadores simulados hasta que haya
credenciales reales. La fase 10 está preparada: el sistema tiene todo lo que
hace falta para desplegarse, verificarse y monitorearse, y lo que queda no se
resuelve escribiendo código —credenciales, aprobaciones de Meta, el piloto con
el equipo y la fecha de corte—. Está todo en [lanzamiento.md](docs/lanzamiento.md).
