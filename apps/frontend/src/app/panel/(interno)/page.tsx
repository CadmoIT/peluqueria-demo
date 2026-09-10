'use client';

// Pantalla principal del panel: la agenda del día.
//
// Es lo primero que se ve al entrar, y a propósito: el panel se abre para mirar
// qué hay hoy, no para administrar. Todo lo demás está a un clic desde acá.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Boton } from '@manly/interfaz';

import { usarSesion } from '@/caracteristicas/autenticacion/usar-sesion';
import { Agenda, hoyLocal } from '@/componentes/panel/agenda';
import { NuevaReserva, NuevoBloqueo } from '@/componentes/panel/nueva-reserva';
import { Cargando, TituloPanel, Vacio } from '@/componentes/panel/primitivos';
import { obtenerSucursalesAdmin } from '@/servicios/panel';

type Formulario = 'ninguno' | 'reserva' | 'bloqueo';

export default function PaginaAgenda() {
  const { usuario } = usarSesion();
  const [sucursalId, setSucursalId] = useState('');
  const [dia, setDia] = useState(hoyLocal);
  const [formulario, setFormulario] = useState<Formulario>('ninguno');

  const sucursales = useQuery({
    queryKey: ['panel', 'sucursales'],
    queryFn: obtenerSucursalesAdmin,
    staleTime: 300_000,
  });

  const activas = (sucursales.data ?? []).filter((sucursal) => sucursal.activa);
  const elegida = sucursalId === '' ? (activas[0]?.id ?? '') : sucursalId;

  if (sucursales.isPending) return <Cargando />;

  if (activas.length === 0) {
    return (
      <>
        <TituloPanel>Agenda</TituloPanel>
        <Vacio>No hay sucursales activas todavía.</Vacio>
      </>
    );
  }

  const esGerencia = usuario?.rol === 'gerencia';

  return (
    <>
      <TituloPanel
        accion={
          esGerencia && (
            <div className="flex gap-2">
              <Boton
                type="button"
                onClick={() => setFormulario(formulario === 'reserva' ? 'ninguno' : 'reserva')}
              >
                Turno nuevo
              </Boton>
              <Boton
                variante="contorno"
                type="button"
                onClick={() => setFormulario(formulario === 'bloqueo' ? 'ninguno' : 'bloqueo')}
              >
                Bloquear franja
              </Boton>
            </div>
          )
        }
      >
        Agenda
      </TituloPanel>

      {formulario === 'reserva' && (
        <div className="mb-6">
          <NuevaReserva sucursalId={elegida} dia={dia} alGuardar={() => setFormulario('ninguno')} />
        </div>
      )}

      {formulario === 'bloqueo' && (
        <div className="mb-6">
          <NuevoBloqueo sucursalId={elegida} dia={dia} alGuardar={() => setFormulario('ninguno')} />
        </div>
      )}

      <Agenda
        sucursales={activas}
        sucursalId={elegida}
        setSucursalId={setSucursalId}
        dia={dia}
        setDia={setDia}
      />
    </>
  );
}
