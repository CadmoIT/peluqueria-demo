// Layout raíz de la aplicación: define el idioma, los metadatos base y los estilos.
import type { Metadata, Viewport } from 'next';

import '@/estilos/global.css';

export const metadata: Metadata = {
  title: {
    default: 'Manly',
    template: '%s | Manly',
  },
  description: 'Peluquería para hombres en Buenos Aires. Reservá tu turno online.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_URL_PUBLICA ?? 'http://localhost:3000'),
};

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
};

export default function LayoutRaiz({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body>{children}</body>
    </html>
  );
}
