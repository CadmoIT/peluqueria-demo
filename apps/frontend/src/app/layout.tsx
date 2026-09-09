// Layout raíz: idioma, tipografías de la marca, metadatos base y estilos.
import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';

import { ProveedorConsultas } from '@/contextos/consultas';

import '@/estilos/global.css';

// Las fuentes se exponen como variables CSS y las consumen los tokens de
// @manly/interfaz (--font-titulo y --font-texto). Cambiar la tipografía de la
// marca es reemplazar estos dos archivos y sus declaraciones.
//
// Se sirven desde el repositorio, no desde next/font/google: ese descarga las
// tipografías durante el build, así que un corte de red o un proxy rompe el
// despliegue. Los archivos son el subset latino de las variables Bodoni Moda e
// Inter (SIL Open Font License).
const fuenteTitulo = localFont({
  src: '../estilos/fuentes/bodoni-moda-variable.woff2',
  variable: '--fuente-titulo',
  display: 'swap',
  weight: '400 700',
  fallback: ['Georgia', 'Times New Roman', 'serif'],
});

const fuenteTexto = localFont({
  src: '../estilos/fuentes/inter-variable.woff2',
  variable: '--fuente-texto',
  display: 'swap',
  weight: '400 700',
  fallback: ['system-ui', '-apple-system', 'sans-serif'],
});

export const metadata: Metadata = {
  title: {
    default: 'Manly — Peluquería para hombres en Buenos Aires',
    template: '%s | Manly',
  },
  description:
    'Peluquería para hombres en Buenos Aires. Reservá tu turno online en Las Cañitas, Colegiales o Belgrano.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_URL_PUBLICA ?? 'http://localhost:3000'),
  openGraph: {
    type: 'website',
    locale: 'es_AR',
    siteName: 'Manly',
  },
};

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
};

export default function LayoutRaiz({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={`${fuenteTitulo.variable} ${fuenteTexto.variable}`}>
      <body>
        <ProveedorConsultas>{children}</ProveedorConsultas>
      </body>
    </html>
  );
}
