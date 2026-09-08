// Gestión de la reserva sin cuenta: consulta, cancelación y reprogramación
// mediante un enlace firmado. Se implementa en la Fase 5.
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Mi reserva',
  // El enlace es privado: no debe indexarse ni aparecer en buscadores.
  robots: { index: false, follow: false },
};

interface Props {
  params: Promise<{ token: string }>;
}

export default async function PaginaMiReserva({ params }: Props) {
  const { token } = await params;

  return (
    <section className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl">Mi reserva</h1>
      <p className="mt-4 text-neutral-600">
        Pendiente: consulta de la reserva <code>{token}</code> (Fase 5).
      </p>
    </section>
  );
}
