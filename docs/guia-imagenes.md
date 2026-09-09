# Guía de imágenes

Las fotografías viven en `apps/frontend/public/imagenes` y forman parte del despliegue.
La carga desde el panel queda fuera de la primera versión.

Ningún componente referencia rutas sueltas: todo pasa por el catálogo tipado de
`apps/frontend/src/utilidades/imagenes.ts`. Reemplazar una foto es cambiar el archivo y,
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

## Qué hay cargado

| Carpeta          | Qué hay                                                         |
| ---------------- | --------------------------------------------------------------- |
| `marca/`         | Los tres productos de la línea propia y el conjunto en diagonal |
| `inicio/`        | Portada editorial y un detalle del trabajo con la máquina       |
| `servicios/`     | Un perfil con el corte terminado                                |
| `sucursales/`    | **Nada todavía**: las tres usan el respaldo                     |
| `profesionales/` | **Nada todavía**                                                |

Todo el material entregado es **vertical** (9:16, 3:4 y 4:5), entre 640 y 1320 px
de ancho. Por eso la portada es una composición partida y no una foto a sangre:
estirar un retrato a formato apaisado lo recorta justo donde está el sujeto.

## Entradas pendientes

Las entradas del catálogo marcadas con `pendiente` apuntan a
`marca/respaldo.svg` en vez de a una fotografía. El sitio se ve completo y sin
huecos rotos, pero esas imágenes todavía no son las definitivas.

Para cargar una: dejar el archivo en la carpeta que corresponda y reemplazar la
llamada a `pendiente(...)` por la entrada real con su `ruta`, `alt`, `ancho` y
`alto`. Al quitar el `pendiente` la imagen deja de usar el respaldo.

El logotipo y el respaldo actuales también son provisorios: son marcadores hasta
que llegue el material oficial de Manly.

## Derechos

Sólo fotografías propias o con licencia comercial verificada. Ante la duda, no se
sube.
