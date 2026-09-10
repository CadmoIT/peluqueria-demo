'use client';

// Solicitudes de cambio que el cliente pidió fuera del plazo automático.
//
// Mientras están pendientes **el horario original sigue ocupado**: aprobar es lo
// que lo libera o lo mueve. Por eso las pendientes van primero y ordenadas por
// la fecha del turno, no por la del pedido: lo que corre es el turno.
//
// Rechazar obliga a escribir el motivo. Sin él, el cliente recibe una negativa
// sin explicación y el local se queda sin registro de por qué se decidió así.
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SolicitudPanel } from '@manly/contratos';

import { Boton } from '@manly/interfaz';

import {
  Aviso,
  Campo,
  Cargando,
  Entrada,
  Estado,
  Seleccion,
  Tarjeta,
  TituloPanel,
  Vacio,
} from '@/componentes/panel/primitivos';
import { ErrorApi } from '@/servicios/api';
import { obtenerSolicitudes, resolverSolicitud } from '@/servicios/panel';
import { formatearDiaYHora, formatearPrecio } from '@/utilidades/formato';

function mensajeDe(error: unknown): string {
  if (!(error instanceof ErrorApi)) return 'Algo salió mal. Probá de nuevo.';

  return [error.message, ...error.detalles.map((detalle) => detalle.motivo)].join(' ');
}

export default function PaginaSolicitudes() {
  const [estado, setEstado] = useState('pendiente');

  const solicitudes = useQuery({
    queryKey: ['panel', 'solicitudes', estado],
    queryFn: () => obtenerSolicitudes(estado === 'todas' ? undefined : estado),
  });

  return (
    <>
      <TituloPanel
        accion={
          <Seleccion
            aria-label="Filtrar por estado"
            value={estado}
            onChange={(evento) => setEstado(evento.target.value)}
            className="w-44"
          >
            <option value="pendiente">Pendientes</option>
            <option value="aprobada">Aprobadas</option>
            <option value="rechazada">Rechazadas</option>
            <option value="todas">Todas</option>
          </Seleccion>
        }
      >
        Solicitudes
      </TituloPanel>

      {solicitudes.isPending ? (
        <Cargando />
      ) : (solicitudes.data ?? []).length === 0 ? (
        <Vacio>No hay solicitudes con ese estado.</Vacio>
      ) : (
        <ul className="space-y-4">
          {(solicitudes.data ?? []).map((solicitud) => (
            <li key={solicitud.id}>
              <FichaSolicitud solicitud={solicitud} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function FichaSolicitud({ solicitud }: { solicitud: SolicitudPanel }) {
  const clientes = useQueryClient();
  const [respuesta, setRespuesta] = useState('');

  const resolver = useMutation({
    mutationFn: (decision: 'aprobar' | 'rechazar') =>
      resolverSolicitud(solicitud.id, {
        decision,
        respuesta: respuesta === '' ? null : respuesta,
      }),
    onSuccess: () => {
      void clientes.invalidateQueries({ queryKey: ['panel', 'solicitudes'] });
      void clientes.invalidateQueries({ queryKey: ['panel', 'agenda'] });
    },
  });

  const pendiente = solicitud.estado === 'pendiente';
  const faltaMotivo = respuesta.trim() === '';

  return (
    <Tarjeta>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-menor">
            <strong>{solicitud.clienteNombre ?? 'Sin nombre'}</strong> pide{' '}
            {solicitud.tipo === 'cancelacion' ? 'cancelar' : 'reprogramar'}
          </p>
          <p className="text-nota text-grafito mt-1">
            {formatearDiaYHora(solicitud.comienzaEn)} · {solicitud.sucursalNombre}
            {solicitud.seniaTotalCentavos > 0 &&
              ` · seña de ${formatearPrecio(solicitud.seniaTotalCentavos)}`}
          </p>
          {solicitud.motivo !== null && (
            <p className="text-menor text-grafito mt-2">«{solicitud.motivo}»</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Estado valor={solicitud.estado} />
          <Link
            href={`/panel/reservas/${solicitud.reservaId}`}
            className="text-nota underline underline-offset-4"
          >
            Ver turno
          </Link>
        </div>
      </div>

      {solicitud.tipo === 'reprogramacion' && pendiente && (
        <p className="rounded-manly bg-niebla text-nota text-grafito mt-3 px-3 py-2">
          Aprobar mueve el turno al horario que propuso. Si ese horario ya está tomado, el cambio no
          se aplica y el turno original queda intacto.
        </p>
      )}

      {!pendiente && solicitud.respuesta !== null && (
        <p className="text-nota text-grafito mt-3">
          Respuesta de {solicitud.resueltaPor ?? 'gerencia'}: «{solicitud.respuesta}»
        </p>
      )}

      {pendiente && (
        <div className="border-borde mt-4 space-y-3 border-t pt-4">
          <Campo etiqueta="Respuesta al cliente" ayuda="Obligatoria si se rechaza.">
            <Entrada value={respuesta} onChange={(evento) => setRespuesta(evento.target.value)} />
          </Campo>

          {resolver.isError && <Aviso tono="error">{mensajeDe(resolver.error)}</Aviso>}

          <div className="flex gap-2">
            <Boton
              type="button"
              disabled={resolver.isPending}
              onClick={() => resolver.mutate('aprobar')}
            >
              Aprobar
            </Boton>
            <Boton
              variante="contorno"
              type="button"
              disabled={resolver.isPending || faltaMotivo}
              onClick={() => resolver.mutate('rechazar')}
            >
              Rechazar
            </Boton>
          </div>
        </div>
      )}
    </Tarjeta>
  );
}
