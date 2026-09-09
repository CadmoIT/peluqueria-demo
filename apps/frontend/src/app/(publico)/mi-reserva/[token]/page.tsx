// Gestión de la reserva sin cuenta, mediante el enlace privado.
//
// El token de la URL es la credencial del cliente, así que la página no se
// indexa ni se comparte por referer: cualquiera con el enlace entra.
import type { Metadata } from 'next';

import { GestionReserva } from '@/componentes/reservas/gestion-reserva';

export const metadata: Metadata = {
  title: 'Mi reserva',
  robots: { index: false, follow: false },
  // Evita que el token viaje en la cabecera Referer hacia otros sitios.
  referrer: 'no-referrer',
};

interface Props {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PaginaMiReserva({ params, searchParams }: Props) {
  const { token } = await params;
  const parametros = await searchParams;

  return <GestionReserva token={token} esNueva={parametros.nueva === '1'} />;
}
