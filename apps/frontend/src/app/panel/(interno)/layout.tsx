// Envuelve las pantallas que exigen sesión.
//
// Las de acceso —ingreso, invitación, recuperación— quedan afuera a propósito:
// están en otro grupo de rutas, sin esta carcasa, porque pedirle sesión a quien
// justamente viene a iniciarla sería un bucle.
import type { ReactNode } from 'react';

import { CapaPanel } from '@/componentes/panel/capa-panel';

export default function LayoutInterno({ children }: { children: ReactNode }) {
  return <CapaPanel>{children}</CapaPanel>;
}
