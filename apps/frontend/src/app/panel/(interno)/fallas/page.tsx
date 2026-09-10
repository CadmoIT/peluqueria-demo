'use client';

// Avisos que no llegaron.
//
// Es la pantalla que evita el peor caso silencioso del sistema: un cliente que
// nunca se enteró de que su turno cambió, y nadie en el local se enteró de que
// no se enteró. El worker reintenta con espera creciente y, agotados los
// intentos, la notificación queda fallida y aparece acá.
//
// No hay botón de reintentar a propósito: si tres intentos fallaron, el
// problema no se arregla apretando de nuevo. Lo que corresponde es llamar.
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

import {
  Aviso,
  Cargando,
  Seleccion,
  Tarjeta,
  TituloPanel,
  Vacio,
} from '@/componentes/panel/primitivos';
import { obtenerFallas } from '@/servicios/panel';
import { formatearDiaYHora } from '@/utilidades/formato';

export default function PaginaFallas() {
  const [dias, setDias] = useState(7);

  const fallas = useQuery({
    queryKey: ['panel', 'fallas', dias],
    queryFn: () => obtenerFallas(dias),
  });

  return (
    <>
      <TituloPanel
        accion={
          <Seleccion
            aria-label="Período que se muestra"
            value={String(dias)}
            onChange={(evento) => setDias(Number(evento.target.value))}
            className="w-44"
          >
            <option value="1">Último día</option>
            <option value="7">Última semana</option>
            <option value="30">Último mes</option>
          </Seleccion>
        }
      >
        Avisos que no llegaron
      </TituloPanel>

      {fallas.isPending ? (
        <Cargando />
      ) : (fallas.data ?? []).length === 0 ? (
        <Vacio>Todo lo que se intentó mandar, llegó.</Vacio>
      ) : (
        <>
          <div className="mb-4">
            <Aviso tono="atencion">
              Estos clientes no recibieron su aviso. Conviene llamarlos: reintentar no sirve, ya se
              intentó tres veces.
            </Aviso>
          </div>

          <ul className="space-y-3">
            {(fallas.data ?? []).map((falla) => (
              <li key={falla.id}>
                <Tarjeta>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-menor">
                        <strong>{falla.clienteNombre ?? 'Sin nombre'}</strong> · {falla.tipo}
                      </p>
                      <p className="text-nota text-grafito mt-1">
                        Por {falla.canal} a {falla.destino ?? 'destino desconocido'} ·{' '}
                        {falla.intentos} intento(s)
                      </p>
                      {falla.comienzaEn !== null && (
                        <p className="text-nota text-grafito">
                          Turno: {formatearDiaYHora(falla.comienzaEn)}
                        </p>
                      )}
                      {falla.ultimoError !== null && (
                        <p className="text-nota text-humo mt-2">{falla.ultimoError}</p>
                      )}
                    </div>

                    {falla.reservaId !== null && (
                      <Link
                        href={`/panel/reservas/${falla.reservaId}`}
                        className="text-nota underline underline-offset-4"
                      >
                        Ver turno
                      </Link>
                    )}
                  </div>
                </Tarjeta>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
