// Raíz del panel interno.
//
// Lo único que define acá es que **nada del panel se indexa**. Es la línea que
// impide que la agenda, los nombres de los clientes o la pantalla de ingreso
// aparezcan en un buscador.
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Panel',
  robots: { index: false, follow: false, nocache: true },
};

export default function LayoutPanel({ children }: { children: ReactNode }) {
  return children;
}
