// Panel interno para gerencia y profesionales. Se implementa en la Fase 8.
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Panel',
  robots: { index: false, follow: false },
};

export default function PaginaPanel() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <h1 className="text-3xl">Panel</h1>
      <p className="mt-4 text-neutral-600">Pendiente: panel interno (Fase 8).</p>
    </section>
  );
}
