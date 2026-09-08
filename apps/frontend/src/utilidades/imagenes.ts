// Catálogo tipado de imágenes del sitio.
//
// Ningún componente escribe una ruta de imagen a mano: todo sale de acá. Cambiar
// una fotografía es reemplazar el archivo en public/imagenes y, si cambió el
// nombre, esta entrada. Ver docs/guia-imagenes.md para formatos y proporciones.
//
// Las entradas marcadas como pendientes apuntan al respaldo hasta que llegue la
// fotografía real, así el sitio nunca muestra un hueco roto.

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

/** Crea una entrada pendiente que apunta al respaldo con la proporción pedida. */
function pendiente(alt: string, ancho: number, alto: number): ImagenCatalogo {
  return { ...IMAGEN_RESPALDO, alt, ancho, alto, pendiente: true };
}

export const IMAGENES = {
  marca: {
    logo: {
      ruta: '/imagenes/marca/logo.svg',
      alt: 'Manly',
      ancho: 240,
      alto: 80,
    },
  },

  inicio: {
    portada: pendiente('Interior de una sucursal de Manly', 2400, 1350),
    experiencia: pendiente('Detalle del trabajo de un profesional de Manly', 1600, 1200),
  },

  sucursales: {
    lasCanitas: pendiente('Fachada de la sucursal de Las Cañitas', 1600, 1200),
    colegiales: pendiente('Fachada de la sucursal de Virrey Avilés, Colegiales', 1600, 1200),
    belgrano: pendiente('Fachada de la sucursal de Aguilar, Belgrano', 1600, 1200),
  },
} as const satisfies Record<string, Record<string, ImagenCatalogo>>;

/** Devuelve la imagen pedida, o el respaldo si todavía no está cargada. */
export function obtenerImagen(imagen: ImagenCatalogo | undefined): ImagenCatalogo {
  return imagen ?? IMAGEN_RESPALDO;
}
