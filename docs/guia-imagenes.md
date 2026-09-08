# Guía de imágenes

Las fotografías viven en `apps/web/public/imagenes` y forman parte del despliegue.
La carga desde el panel queda fuera de la primera versión.

Ningún componente referencia rutas sueltas: todo pasa por el catálogo tipado de
`apps/web/src/utilidades/imagenes.ts`. Reemplazar una foto es cambiar el archivo y,
si cambió el nombre, esa entrada del catálogo.

## Carpetas

| Carpeta          | Contenido                         |
| ---------------- | --------------------------------- |
| `marca/`         | Logo, isotipo, imagen de respaldo |
| `inicio/`        | Portada y secciones de la home    |
| `servicios/`     | Una por servicio o categoría      |
| `sucursales/`    | Fachada e interior de cada local  |
| `profesionales/` | Retratos del equipo               |

## Nombres

Minúsculas, sin acentos ni espacios, separados por guiones, describiendo el
contenido y no su posición en la página.

```text
Bien:  sucursales/las-canitas-fachada.webp
Mal:   sucursales/IMG_2043.JPG
Mal:   sucursales/foto-2.webp
```

## Formatos y peso

| Uso                | Formato     | Ancho   | Peso máximo |
| ------------------ | ----------- | ------- | ----------- |
| Portada            | WebP o AVIF | 2400 px | 400 KB      |
| Sección / servicio | WebP o AVIF | 1600 px | 250 KB      |
| Retrato            | WebP o AVIF | 800 px  | 150 KB      |
| Logo e iconos      | SVG         | —       | 20 KB       |

Next.js sirve AVIF y WebP automáticamente, pero el original ya debe venir
optimizado: no se sube un JPG de cámara sin comprimir.

## Proporciones

| Uso                | Proporción |
| ------------------ | ---------- |
| Portada            | 16:9       |
| Sección / servicio | 4:3        |
| Retrato            | 1:1        |

Respetar la proporción evita recortes que cortan caras o pierden el encuadre.

## Texto alternativo

Cada entrada del catálogo lleva su `alt` obligatorio. Describe la imagen para
alguien que no la ve; no repite el nombre del archivo ni dice "foto de".

```text
Bien:  "Interior del local de Las Cañitas con tres sillones de barbería"
Mal:   "las-canitas-interior"
Mal:   "Foto"
```

## Derechos

Sólo fotografías propias o con licencia comercial verificada. Ante la duda, no se
sube.
