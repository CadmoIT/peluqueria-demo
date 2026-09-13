// Catálogo tipado de imágenes del sitio.
//
// Ningún componente escribe una ruta de imagen a mano: todo sale de acá. Cambiar
// una fotografía es reemplazar el archivo en public/imagenes y, si cambió el
// nombre, esta entrada. Ver docs/guia-imagenes.md para formatos y proporciones.
//
// Si una entrada llegara vacía, `obtenerImagen` devuelve el respaldo: el sitio
// no muestra un hueco roto.

/** Una imagen del catálogo, con su texto alternativo obligatorio. */
export interface ImagenCatalogo {
  ruta: string;
  /** Describe la imagen para quien no la ve. Nunca vacío en imágenes de contenido. */
  alt: string;
  ancho: number;
  alto: number;
  /** Marca que todavía se está usando el respaldo y falta la foto definitiva. */
  pendiente?: boolean;
}

/** Se muestra mientras una fotografía del catálogo no fue cargada. */
export const IMAGEN_RESPALDO: ImagenCatalogo = {
  ruta: '/imagenes/marca/respaldo.svg',
  alt: '',
  ancho: 1200,
  alto: 800,
  pendiente: true,
};

export const IMAGENES = {
  marca: {
    pomadaMate: {
      ruta: '/imagenes/marca/pomada-mate.webp',
      alt: 'Pomada de acabado mate de Manly, en su lata negra con el monograma',
      ancho: 640,
      alto: 853,
    },
    pomadaTransparente: {
      ruta: '/imagenes/marca/pomada-transparente.webp',
      alt: 'Pomada transparente de Manly apoyada sobre un bloque de hormigón',
      ancho: 640,
      alto: 783,
    },
    polvoTexturizador: {
      ruta: '/imagenes/marca/polvo-texturizador.webp',
      alt: 'Frasco del polvo texturizador de Manly sobre una superficie de vidrio',
      ancho: 640,
      alto: 800,
    },
    lineaProductos: {
      ruta: '/imagenes/marca/linea-productos.webp',
      alt: 'Varios frascos de la línea de productos de Manly ordenados en diagonal',
      ancho: 790,
      alto: 1402,
    },
  },

  inicio: {
    portada: {
      ruta: '/imagenes/inicio/portada-salon.webp',
      alt: 'Tres sillones de barbería en fila dentro del salón en penumbra',
      ancho: 1770,
      alto: 934,
    },
    experiencia: {
      ruta: '/imagenes/inicio/detalle-corte.webp',
      alt: 'Detalle de un profesional de Manly perfilando un corte con la máquina',
      ancho: 814,
      alto: 1446,
    },
  },

  servicios: {
    corte: {
      ruta: '/imagenes/servicios/corte-perfil.webp',
      alt: 'Perfil de un cliente con el corte terminado en Manly',
      ancho: 986,
      alto: 1751,
    },
  },
} as const satisfies Record<string, Record<string, ImagenCatalogo>>;

/** Devuelve la imagen pedida, o el respaldo si todavía no está cargada. */
export function obtenerImagen(imagen: ImagenCatalogo | undefined): ImagenCatalogo {
  return imagen ?? IMAGEN_RESPALDO;
}
