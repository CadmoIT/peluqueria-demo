// Flujo de reserva: sucursal, servicios, preferencia de profesional, horario,
// datos de contacto y seña. Se implementa en la Fase 5.
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reservar turno',
};

export default function PaginaReservar() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl">Reservar turno</h1>
      <p className="mt-4 text-neutral-600">Pendiente: flujo de reserva (Fase 5).</p>
    </section>
  );
}
