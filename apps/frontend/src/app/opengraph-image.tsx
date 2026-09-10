// Imagen que se ve cuando alguien comparte el sitio.
//
// Sin esto, un enlace de Manly pegado en WhatsApp o en Instagram aparece como
// un renglón de texto gris. Para un local que se difunde justamente por ahí, es
// la diferencia entre que el enlace invite a entrar o pase inadvertido.
//
// Se genera en vez de usar una fotografía porque las que hay son verticales
// (1320×1760) y este formato es apaisado (1200×630): recortarlas dejaría un
// pedazo arbitrario de una cara. Una tarjeta tipográfica en blanco y negro es
// la identidad de la marca y se lee igual de bien en cualquier miniatura.
import { ImageResponse } from 'next/og';

export const alt = 'Manly Barber Studio — Peluquería para hombres en Buenos Aires';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function ImagenParaCompartir() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        // Los colores van literales: la tarjeta se arma fuera del navegador,
        // donde las variables CSS de la marca no existen. Son `tinta` y `lino`
        // convertidos a sRGB.
        backgroundColor: '#090909',
        color: '#fafaf9',
        padding: '72px 80px',
      }}
    >
      <div style={{ display: 'flex', fontSize: 28, letterSpacing: '0.18em' }}>
        MANLY BARBER STUDIO
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', fontSize: 92, lineHeight: 1.05, maxWidth: 800 }}>
          Peluquería para hombres
        </div>
        <div style={{ display: 'flex', fontSize: 34, color: '#b1b1b1' }}>
          Tres sucursales en Buenos Aires · Turnos online
        </div>
      </div>

      <div style={{ display: 'flex', fontSize: 26, letterSpacing: '0.18em', color: '#b1b1b1' }}>
        LAS CAÑITAS · COLEGIALES · BELGRANO
      </div>
    </div>,
    size,
  );
}
