// Estado del flujo de reserva.
//
// El flujo tiene un orden fijo y cada paso invalida a los siguientes: cambiar
// de sucursal tira abajo los servicios elegidos, cambiar de servicios tira
// abajo el horario, y así. Concentrarlo acá evita que la interfaz quede con
// combinaciones imposibles, como un horario elegido para un servicio que ya no
// está seleccionado.
'use client';

import { useCallback, useMemo, useState } from 'react';

import type { OpcionDisponibilidad, ServicioPublico } from '@manly/contratos';

export const PASOS = ['sucursal', 'servicios', 'profesionales', 'horario', 'datos'] as const;
export type Paso = (typeof PASOS)[number];

/** Preferencia de profesional para un servicio. `null` es "cualquiera". */
export type PreferenciasProfesional = Record<string, string | null>;

export interface EstadoFlujo {
  paso: Paso;
  sucursalId: string | null;
  serviciosElegidos: ServicioPublico[];
  preferencias: PreferenciasProfesional;
  opcion: OpcionDisponibilidad | null;
}

const INICIAL: EstadoFlujo = {
  paso: 'sucursal',
  sucursalId: null,
  serviciosElegidos: [],
  preferencias: {},
  opcion: null,
};

export function usarFlujoReserva(sucursalInicial: string | null = null) {
  const [estado, setEstado] = useState<EstadoFlujo>(() =>
    sucursalInicial ? { ...INICIAL, sucursalId: sucursalInicial, paso: 'servicios' } : INICIAL,
  );

  const elegirSucursal = useCallback((sucursalId: string) => {
    // Los servicios dependen de la sucursal: cambiarla vacía todo lo demás.
    setEstado({ ...INICIAL, sucursalId, paso: 'servicios' });
  }, []);

  const alternarServicio = useCallback((servicio: ServicioPublico, maximo: number) => {
    setEstado((previo) => {
      const yaEstaba = previo.serviciosElegidos.some((otro) => otro.id === servicio.id);

      const serviciosElegidos = yaEstaba
        ? previo.serviciosElegidos.filter((otro) => otro.id !== servicio.id)
        : previo.serviciosElegidos.length >= maximo
          ? previo.serviciosElegidos
          : [...previo.serviciosElegidos, servicio];

      // Las preferencias sólo valen para los servicios que siguen elegidos.
      const preferencias: PreferenciasProfesional = {};

      for (const elegido of serviciosElegidos) {
        preferencias[elegido.id] = previo.preferencias[elegido.id] ?? null;
      }

      return { ...previo, serviciosElegidos, preferencias, opcion: null };
    });
  }, []);

  const elegirProfesional = useCallback((servicioId: string, profesionalId: string | null) => {
    setEstado((previo) => ({
      ...previo,
      preferencias: { ...previo.preferencias, [servicioId]: profesionalId },
      // El horario disponible depende de quién atienda.
      opcion: null,
    }));
  }, []);

  const elegirOpcion = useCallback((opcion: OpcionDisponibilidad | null) => {
    setEstado((previo) => ({ ...previo, opcion }));
  }, []);

  const irA = useCallback((paso: Paso) => {
    setEstado((previo) => ({ ...previo, paso }));
  }, []);

  const reiniciar = useCallback(() => {
    setEstado(INICIAL);
  }, []);

  /** Hasta qué paso se puede avanzar con lo que hay elegido. */
  const pasoMaximo = useMemo<Paso>(() => {
    if (!estado.sucursalId) return 'sucursal';
    if (estado.serviciosElegidos.length === 0) return 'servicios';
    if (!estado.opcion) return 'horario';

    return 'datos';
  }, [estado.sucursalId, estado.serviciosElegidos.length, estado.opcion]);

  const totales = useMemo(() => {
    const precio = estado.serviciosElegidos.reduce(
      (total, servicio) => total + servicio.precioCentavos,
      0,
    );
    const senia = estado.serviciosElegidos.reduce(
      (total, servicio) => total + servicio.seniaCentavos,
      0,
    );
    const duracion = estado.serviciosElegidos.reduce(
      (total, servicio) => total + servicio.duracionMinutos,
      0,
    );

    return { precio, senia, duracion };
  }, [estado.serviciosElegidos]);

  return {
    estado,
    totales,
    pasoMaximo,
    elegirSucursal,
    alternarServicio,
    elegirProfesional,
    elegirOpcion,
    irA,
    reiniciar,
  };
}
