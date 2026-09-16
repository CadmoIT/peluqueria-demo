// Chinche de mapa, para el enlace que lleva a la ubicación de la sucursal.
//
// Es un dibujo propio y no el logotipo de Google Maps. Por dos razones: ese
// logotipo es marca registrada y su uso tiene condiciones, y sus cuatro colores
// se pelearían con una identidad que es blanco y negro. La chinche se entiende
// igual —es el signo universal de «acá está»— y hereda el color del texto, así
// que sirve lo mismo sobre claro que sobre oscuro.
//
// Va `aria-hidden`: el enlace ya dice «Cómo llegar», y un lector de pantalla que
// anunciara además el icono repetiría lo mismo dos veces.

interface Propiedades {
  /** Lado del dibujo, en píxeles. Por omisión acompaña al texto menor. */
  tamanio?: number;
}

export function IconoMapa({ tamanio = 15 }: Propiedades) {
  return (
    <svg
      width={tamanio}
      height={tamanio}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M10 18c0 0 6-5.2 6-9.5a6 6 0 1 0-12 0C4 12.8 10 18 10 18Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="8.5" r="2.1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
