// Pantallas de acceso: ingreso, invitación y recuperación.
//
// Sin la carcasa del panel y sin guardia de sesión: son las únicas del panel a
// las que se llega justamente sin estar adentro.
import type { ReactNode } from 'react';

export default function LayoutAcceso({ children }: { children: ReactNode }) {
  return (
    <div className="bg-lino flex min-h-screen items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
