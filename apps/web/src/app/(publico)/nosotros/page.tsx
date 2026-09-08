// Página institucional: nosotros.
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Nosotros',
};

export default function PaginaNosotros() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <h1 className="text-3xl">Nosotros</h1>
      <p className="mt-4 text-neutral-600">Pendiente: contenido (Fase 5).</p>
    </section>
  );
}
