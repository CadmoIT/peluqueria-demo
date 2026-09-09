'use client';

// Proveedor de TanStack Query.
//
// El cliente se crea dentro de un estado y no como constante de módulo: en el
// servidor una constante se compartiría entre peticiones de personas distintas
// y les mezclaría la caché.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export function ProveedorConsultas({ children }: { children: ReactNode }) {
  const [cliente] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // La disponibilidad cambia sola: no conviene servirla vieja.
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
}
