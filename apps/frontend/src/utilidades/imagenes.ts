// Catálogo tipado de imágenes del sitio.
// Reemplazar una fotografía es cambiar el archivo en public/imagenes y, si hace
// falta, la ruta de acá: ningún componente referencia rutas sueltas.
// Ver docs/guia-imagenes.md para nombres, formatos, proporciones y peso máximo.

/** Imagen del catálogo, con su texto alternativo obligatorio. */
export interface ImagenCatalogo {
  ruta: string;
  alt: string;
  ancho: number;
  alto: number;
}

/** Se muestra cuando todavía no se cargó la fotografía definitiva. */
export const IMAGEN_RESPALDO: ImagenCatalogo = {
  ruta: '/imagenes/marca/respaldo.svg',
  alt: 'Manly',
  ancho: 1200,
  alto: 800,
};

export const IMAGENES = {
  marca: {
    logo: {
      ruta: '/imagenes/marca/logo.svg',
      alt: 'Manly',
      ancho: 240,
      alto: 80,
    },
  },
} as const satisfies Record<string, Record<string, ImagenCatalogo>>;

/** Devuelve la imagen pedida o el respaldo si todavía no está cargada. */
export function obtenerImagen(imagen: ImagenCatalogo | undefined): ImagenCatalogo {
  return imagen ?? IMAGEN_RESPALDO;
}
