'use client';

// Gestión de la reserva desde el enlace privado.
//
// No hay cuenta ni contraseña: el token del enlace es la credencial. Por eso la
// página se marca como no indexable y el token no se muestra en pantalla.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { Cargando, cn, Contenedor } from '@manly/interfaz';

import { ErrorApi } from '@/servicios/api';
import {
  cancelarReserva,
  consultarEstadoPago,
  consultarReserva,
  crearPreferenciaPago,
} from '@/servicios/reservas';
import { formatearDiaYHora, formatearHora, formatearPrecio } from '@/utilidades/formato';

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente_pago: 'Falta el pago de la seña',
  confirmada: 'Confirmado',
  cancelada: 'Cancelado',
  completada: 'Realizado',
  ausente: 'No asististe',
  expirada: 'Venció sin confirmar',
};

export function GestionReserva({ token, esNueva }: { token: string; esNueva: boolean }) {
  const clienteConsultas = useQueryClient();
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmandoBaja, setConfirmandoBaja] = useState(false);

  const reserva = useQuery({
    queryKey: ['reserva', token],
    queryFn: () => consultarReserva(token),
    retry: false,
  });

  // Mientras falta la seña se consulta el estado cada pocos segundos: la
  // notificación de la pasarela puede demorar y la persona ya está mirando
  // esta pantalla esperando la confirmación.
  const pago = useQuery({
    queryKey: ['pago', token],
    queryFn: () => consultarEstadoPago(token),
    enabled: reserva.data?.estado === 'pendiente_pago',
    refetchInterval: (consulta) =>
      consulta.state.data?.esperandoConfirmacion === true ? 4000 : false,
    retry: false,
  });

  // Cuando el pago se acredita, se refresca la reserva para mostrarla confirmada.
  useEffect(() => {
    if (pago.data?.reservaConfirmada === true) {
      void clienteConsultas.invalidateQueries({ queryKey: ['reserva', token] });
    }
  }, [pago.data?.reservaConfirmada, clienteConsultas, token]);

  const reintentoPago = useMutation({
    mutationFn: () => crearPreferenciaPago(token),
    onSuccess: (preferencia) => {
      window.location.assign(preferencia.urlPago);
    },
    onError: (error: unknown) => {
      setAviso(
        error instanceof ErrorApi ? error.message : 'No pudimos abrir el pago. Probá de nuevo.',
      );
    },
  });

  const cancelacion = useMutation({
    mutationFn: () => cancelarReserva(token),
    onSuccess: async (resultado) => {
      setAviso(resultado.mensaje);
      setConfirmandoBaja(false);
      await clienteConsultas.invalidateQueries({ queryKey: ['reserva', token] });
    },
    onError: (error: unknown) => {
      setAviso(
        error instanceof ErrorApi
          ? error.message
          : 'No pudimos procesar el pedido. Probá de nuevo.',
      );
    },
  });

  if (reserva.isPending) {
    return (
      <Contenedor className="py-seccion max-w-2xl">
        <Cargando mensaje="Buscando tu reserva…" />
      </Contenedor>
    );
  }

  if (reserva.isError) {
    return (
      <Contenedor className="py-seccion max-w-2xl">
        <h1 className="text-titulo">No encontramos esa reserva</h1>
        <p className="text-guia text-grafito mt-4">
          Puede que el enlace esté incompleto. Revisá el mensaje que te mandamos, o escribinos y lo
          resolvemos.
        </p>
      </Contenedor>
    );
  }

  const datos = reserva.data;
  const activa = datos.estado === 'confirmada' || datos.estado === 'pendiente_pago';

  return (
    <Contenedor className="py-seccion max-w-2xl">
      {esNueva && activa ? (
        <p className="versales text-nota text-grafito mb-3">Turno reservado</p>
      ) : null}

      <h1 className="text-titulo">
        {datos.clienteNombre ? `Hola, ${datos.clienteNombre}` : 'Tu reserva'}
      </h1>

      <p className="text-guia text-grafito mt-3">{formatearDiaYHora(datos.comienzaEn)}</p>

      <p
        className={cn(
          'versales text-nota rounded-manly mt-5 inline-block border px-3 py-2',
          datos.estado === 'confirmada' && 'border-tinta',
          datos.estado === 'cancelada' && 'border-borde text-grafito',
          datos.estado === 'pendiente_pago' && 'border-atencion text-atencion',
        )}
      >
        {ETIQUETA_ESTADO[datos.estado] ?? datos.estado}
      </p>

      <section className="border-borde bg-niebla rounded-tarjeta mt-8 border p-5">
        <h2 className="versales text-nota text-grafito mb-4">Tu turno</h2>

        <ol className="flex flex-col gap-3">
          {datos.bloques.map((bloque) => (
            <li key={bloque.orden} className="flex items-baseline justify-between gap-4">
              <span className="text-menor">
                <span className="text-grafito tabular-nums">
                  {formatearHora(bloque.comienzaEn)}
                </span>{' '}
                {bloque.servicioNombre}
                <span className="text-grafito"> · {bloque.profesionalNombre}</span>
              </span>
              <span className="text-menor shrink-0">{formatearPrecio(bloque.precioCentavos)}</span>
            </li>
          ))}
        </ol>

        <div className="border-borde mt-4 flex items-baseline justify-between border-t pt-4">
          <span className="versales text-nota text-grafito">Total</span>
          <span className="text-base">{formatearPrecio(datos.precioTotalCentavos)}</span>
        </div>

        <p className="text-nota text-grafito mt-4">
          {datos.sucursal.nombre} · {datos.sucursal.direccion}
        </p>
      </section>

      {datos.estado === 'pendiente_pago' ? (
        <section className="border-atencion rounded-tarjeta mt-8 border p-5">
          <h2 className="text-subtitulo">Falta pagar la seña</h2>

          <p className="text-menor text-grafito mt-2">
            Tu turno queda reservado hasta que se acredite el pago de{' '}
            {formatearPrecio(datos.seniaTotalCentavos)}.
          </p>

          {pago.data?.esperandoConfirmacion === true ? (
            <p role="status" className="text-menor mt-4">
              Estamos esperando la confirmación del pago…
            </p>
          ) : null}

          <button
            type="button"
            disabled={reintentoPago.isPending}
            onClick={() => {
              reintentoPago.mutate();
            }}
            className="versales bg-tinta text-lino rounded-manly text-menor mt-5 inline-flex min-h-11 items-center px-6 disabled:opacity-45"
          >
            {reintentoPago.isPending ? 'Abriendo…' : 'Pagar la seña'}
          </button>
        </section>
      ) : null}

      {aviso ? (
        <p role="status" className="border-borde rounded-manly text-menor mt-6 border p-4">
          {aviso}
        </p>
      ) : null}

      {activa ? (
        <section className="mt-8">
          <h2 className="versales text-nota text-grafito mb-3">¿Necesitás cambiarlo?</h2>

          {datos.puedeGestionarse ? (
            <p className="text-menor text-grafito mb-4">
              Podés cancelar hasta {datos.horasMinimasCancelacion} horas antes del turno.
            </p>
          ) : (
            <p className="text-menor text-grafito mb-4">
              Falta menos de {datos.horasMinimasCancelacion} horas para tu turno, así que el cambio
              lo tiene que revisar el local. Igual podés pedirlo desde acá.
            </p>
          )}

          {confirmandoBaja ? (
            <div className="border-borde rounded-tarjeta border p-4">
              <p className="text-menor">¿Seguro que querés cancelar este turno?</p>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={cancelacion.isPending}
                  onClick={() => {
                    cancelacion.mutate();
                  }}
                  className="versales bg-tinta text-lino rounded-manly text-menor min-h-11 px-5 disabled:opacity-45"
                >
                  {cancelacion.isPending ? 'Cancelando…' : 'Sí, cancelar'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setConfirmandoBaja(false);
                  }}
                  className="versales border-borde rounded-manly text-menor min-h-11 border px-5"
                >
                  No, dejarlo
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setConfirmandoBaja(true);
              }}
              className="versales border-borde hover:border-tinta rounded-manly text-menor min-h-11 border px-5 transition-colors"
            >
              Cancelar turno
            </button>
          )}
        </section>
      ) : null}
    </Contenedor>
  );
}
