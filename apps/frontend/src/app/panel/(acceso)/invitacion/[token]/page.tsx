// Aceptación de una invitación al panel.
//
// El token viaja en la URL y **sirve una sola vez**: al definir la contraseña se
// consume. Por eso la página no lo guarda en ningún lado ni lo muestra.
import { FormularioContrasenia } from '@/componentes/panel/formulario-acceso';

export default async function PaginaInvitacion({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  return <FormularioContrasenia token={token} modo="invitacion" />;
}
