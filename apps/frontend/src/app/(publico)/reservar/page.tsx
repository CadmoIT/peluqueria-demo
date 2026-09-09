// Página de reserva.
//
// Acepta `?sucursal=` para que los enlaces desde la página de sucursales
// lleguen con la sucursal ya elegida, como pide el plan.
import type { Metadata } from 'next';

import { FlujoReserva } from '@/componentes/reservas/flujo-reserva';

export const metadata: Metadata = {
  title: 'Reservar turno',
  description:
    'Reservá tu turno en Manly. Elegí sucursal, servicios, profesional y horario en un minuto.',
  alternates: { canonical: '/reservar' },
};

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PaginaReservar({ searchParams }: Props) {
  const parametros = await searchParams;
  const sucursal = parametros.sucursal;

  return <FlujoReserva sucursalInicial={typeof sucursal === 'string' ? sucursal : undefined} />;
}
