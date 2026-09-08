// Estructura común de las páginas institucionales: navegación y pie.
// El contenido definitivo de ambos se construye en la Fase 5.
export default function LayoutPublico({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-neutral-200">
        <nav aria-label="Principal" className="mx-auto max-w-6xl px-4 py-4">
          <span className="font-semibold uppercase tracking-widest">Manly</span>
        </nav>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-neutral-200">
        <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-neutral-600">
          © {new Date().getFullYear()} Manly
        </div>
      </footer>
    </div>
  );
}
