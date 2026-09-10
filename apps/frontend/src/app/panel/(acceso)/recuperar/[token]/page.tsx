// Cambio de contraseña con el enlace de recuperación.
import { FormularioContrasenia } from '@/componentes/panel/formulario-acceso';

export default async function PaginaNuevaContrasenia({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return <FormularioContrasenia token={token} modo="recuperacion" />;
}
