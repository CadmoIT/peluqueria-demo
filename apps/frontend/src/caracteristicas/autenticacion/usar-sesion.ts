'use client';

// Sesión del panel.
//
// La cookie es `httpOnly`, así que la página no puede leerla. Quién está
// adentro se averigua preguntándole a la API, y la respuesta se cachea.
//
// Un 401 **no se reintenta ni se guarda como error a mostrar**: significa que
// no hay sesión, que es un estado normal —recién llegaste a la pantalla de
// ingreso— y no una falla.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UsuarioSesion } from '@manly/contratos';

import { ErrorApi } from '@/servicios/api';
import { ingresar, quienSoy, salir } from '@/servicios/panel';

export const CLAVE_SESION = ['panel', 'sesion'] as const;

export interface Sesion {
  usuario: UsuarioSesion | null;
  cargando: boolean;
  /** La API no respondió: distinto de no tener sesión. */
  sinConexion: boolean;
}

export function usarSesion(): Sesion {
  const { data, isPending, error } = useQuery({
    queryKey: CLAVE_SESION,
    queryFn: async () => {
      try {
        return await quienSoy();
      } catch (error: unknown) {
        // Sin sesión no es un error: es el estado de quien todavía no entró.
        if (error instanceof ErrorApi && error.estado === 401) return null;

        throw error;
      }
    },
    retry: false,
    staleTime: 60_000,
  });

  return {
    usuario: data ?? null,
    cargando: isPending,
    sinConexion: error instanceof ErrorApi && error.estado === 0,
  };
}

export function usarIngreso() {
  const clientes = useQueryClient();

  return useMutation({
    mutationFn: ingresar,
    onSuccess: (usuario) => {
      // Se guarda la respuesta en vez de invalidar: la API ya devolvió el
      // usuario, y volver a preguntárselo sería un viaje de ida y vuelta de más
      // justo en el momento en que la persona está esperando entrar.
      clientes.setQueryData(CLAVE_SESION, usuario);
    },
  });
}

export function usarSalida() {
  const clientes = useQueryClient();

  return useMutation({
    mutationFn: salir,
    onSuccess: () => {
      // Se limpia todo, no sólo la sesión: la caché tiene agenda, clientes y
      // montos de quien estaba usando el panel.
      clientes.clear();
      clientes.setQueryData(CLAVE_SESION, null);
    },
  });
}
