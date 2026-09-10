'use client';

// Detalle de una reserva: qué es, quién la tomó y qué se cobró.
//
// Es la pantalla donde se mueve dinero, así que las dos acciones que lo hacen
// —cobrar y reintegrar— piden un acto deliberado. El reintegro además exige
// marcar una casilla: devolver plata no puede ser el resultado de un clic de
// más, y esa confirmación viaja en el pedido, no se queda en el navegador.
import { use, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Boton } from '@manly/interfaz';

import { usarSesion } from '@/caracteristicas/autenticacion/usar-sesion';
import {
  Aviso,
  Campo,
  Cargando,
  Entrada,
  Estado,
  Seleccion,
  Tarjeta,
  TituloPanel,
} from '@/componentes/panel/primitivos';
import { ErrorApi } from '@/servicios/api';
import {
  cancelarReserva,
  marcarAsistencia,
  obtenerReserva,
  registrarPagoPresencial,
  reintegrar,
} from '@/servicios/panel';
import { formatearDiaYHora, formatearHora, formatearPrecio } from '@/utilidades/formato';

function mensajeDe(error: unknown): string {
  if (!(error instanceof ErrorApi)) return 'Algo salió mal. Probá de nuevo.';

  return [error.message, ...error.detalles.map((detalle) => detalle.motivo)].join(' ');
}

export default function PaginaReserva({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { usuario } = usarSesion();
  const clientes = useQueryClient();

  const reserva = useQuery({
    queryKey: ['panel', 'reserva', id],
    queryFn: () => obtenerReserva(id),
  });

  function refrescar() {
    void clientes.invalidateQueries({ queryKey: ['panel', 'reserva', id] });
    void clientes.invalidateQueries({ queryKey: ['panel', 'agenda'] });
  }

  const asistencia = useMutation({
    mutationFn: (estado: 'completada' | 'ausente') => marcarAsistencia(id, { estado }),
    onSuccess: refrescar,
  });

  const cancelacion = useMutation({
    mutationFn: () => cancelarReserva(id),
    onSuccess: refrescar,
  });

  if (reserva.isPending) return <Cargando />;

  if (reserva.isError) {
    return <Aviso tono="error">{mensajeDe(reserva.error)}</Aviso>;
  }

  const datos = reserva.data;
  const esGerencia = usuario?.rol === 'gerencia';
  const gestionable = datos.estado === 'confirmada' || datos.estado === 'pendiente_pago';
  const saldo = datos.precioTotalCentavos - datos.cobradoCentavos;

  return (
    <>
      <TituloPanel accion={<Estado valor={datos.estado} />}>
        {datos.clienteNombre ?? 'Sin nombre'}
      </TituloPanel>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Tarjeta>
            <h2 className="versales text-nota tracking-versales text-grafito mb-3">El turno</h2>

            <dl className="text-menor grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <Dato titulo="Cuándo">{formatearDiaYHora(datos.comienzaEn)}</Dato>
              <Dato titulo="Dónde">{datos.sucursalNombre}</Dato>
              <Dato titulo="Termina">{formatearHora(datos.terminaEn)}</Dato>
              <Dato titulo="Total">{formatearPrecio(datos.precioTotalCentavos)}</Dato>
              {esGerencia && (
                <>
                  <Dato titulo="WhatsApp">{datos.contactoWhatsapp ?? '—'}</Dato>
                  <Dato titulo="Correo">{datos.contactoEmail ?? '—'}</Dato>
                </>
              )}
            </dl>

            {datos.canalContacto === null && (
              <p className="text-nota text-humo mt-3">
                Este turno no tiene por dónde avisar: se cargó sin teléfono ni correo.
              </p>
            )}

            <ul className="border-borde text-menor mt-4 space-y-2 border-t pt-4">
              {datos.bloques.map((bloque) => (
                <li key={bloque.orden} className="flex justify-between gap-4">
                  <span>
                    {formatearHora(bloque.comienzaEn)} · {bloque.servicioNombre} ·{' '}
                    <span className="text-grafito">{bloque.profesionalNombre}</span>
                  </span>
                  <span>{formatearPrecio(bloque.precioCentavos)}</span>
                </li>
              ))}
            </ul>
          </Tarjeta>

          {esGerencia && (
            <Tarjeta>
              <h2 className="versales text-nota tracking-versales text-grafito mb-3">Dinero</h2>

              <dl className="text-menor grid gap-x-6 gap-y-2 sm:grid-cols-3">
                <Dato titulo="Seña">{formatearPrecio(datos.seniaTotalCentavos)}</Dato>
                <Dato titulo="Cobrado">{formatearPrecio(datos.cobradoCentavos)}</Dato>
                <Dato titulo="Saldo">{formatearPrecio(saldo)}</Dato>
              </dl>

              {datos.pagos.length > 0 && (
                <ul className="border-borde text-menor mt-4 space-y-1 border-t pt-4">
                  {datos.pagos.map((pago) => (
                    <li key={pago.id} className="flex justify-between gap-4">
                      <span>
                        {pago.tipo} · {pago.medio.replace('_', ' ')} ·{' '}
                        <span className="text-grafito">{pago.estado}</span>
                      </span>
                      <span className={pago.tipo === 'reintegro' ? 'text-error' : undefined}>
                        {pago.tipo === 'reintegro' ? '−' : ''}
                        {formatearPrecio(pago.montoCentavos)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="border-borde mt-4 grid gap-4 border-t pt-4 sm:grid-cols-2">
                <FormularioCobro
                  reservaId={id}
                  sugerido={Math.max(saldo, 0)}
                  alGuardar={refrescar}
                />
                <FormularioReintegro
                  reservaId={id}
                  maximo={datos.cobradoCentavos}
                  alGuardar={refrescar}
                />
              </div>
            </Tarjeta>
          )}
        </div>

        <div className="space-y-4">
          <Tarjeta>
            <h2 className="versales text-nota tracking-versales text-grafito mb-3">Acciones</h2>

            <div className="space-y-2">
              <Boton
                variante="contorno"
                className="w-full"
                type="button"
                disabled={datos.estado !== 'confirmada' || asistencia.isPending}
                onClick={() => asistencia.mutate('completada')}
              >
                Marcar completado
              </Boton>

              <Boton
                variante="contorno"
                className="w-full"
                type="button"
                disabled={datos.estado !== 'confirmada' || asistencia.isPending}
                onClick={() => asistencia.mutate('ausente')}
              >
                Marcar ausente
              </Boton>

              {esGerencia && (
                <Boton
                  variante="texto"
                  className="text-error w-full"
                  type="button"
                  disabled={!gestionable || cancelacion.isPending}
                  onClick={() => cancelacion.mutate()}
                >
                  Cancelar el turno
                </Boton>
              )}
            </div>

            {asistencia.isError && <Aviso tono="error">{mensajeDe(asistencia.error)}</Aviso>}

            {cancelacion.isSuccess && (
              <div className="mt-3">
                <Aviso tono={cancelacion.data.avisado ? 'exito' : 'atencion'}>
                  {cancelacion.data.avisado
                    ? 'Turno cancelado. Le avisamos al cliente.'
                    : 'Turno cancelado. No había por dónde avisarle: comunicate vos.'}
                </Aviso>
              </div>
            )}

            {cancelacion.isError && (
              <div className="mt-3">
                <Aviso tono="error">{mensajeDe(cancelacion.error)}</Aviso>
              </div>
            )}
          </Tarjeta>

          <Link
            href="/panel"
            className="text-menor text-grafito block text-center underline underline-offset-4"
          >
            Volver a la agenda
          </Link>
        </div>
      </div>
    </>
  );
}

function Dato({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="versales text-nota text-humo">{titulo}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function FormularioCobro({
  reservaId,
  sugerido,
  alGuardar,
}: {
  reservaId: string;
  sugerido: number;
  alGuardar: () => void;
}) {
  const [pesos, setPesos] = useState(String(Math.round(sugerido / 100)));
  const [medio, setMedio] = useState<'efectivo' | 'qr_mercado_pago' | 'otro'>('efectivo');
  const [tipo, setTipo] = useState<'senia' | 'saldo'>('saldo');

  const cobrar = useMutation({
    mutationFn: registrarPagoPresencial,
    onSuccess: alGuardar,
  });

  function enviar(evento: FormEvent) {
    evento.preventDefault();

    cobrar.mutate({ reservaId, medio, tipo, montoCentavos: Number(pesos) * 100 });
  }

  return (
    <form onSubmit={enviar} className="space-y-3">
      <h3 className="versales text-nota text-grafito">Cobrar en el local</h3>

      <Campo etiqueta="Monto en pesos">
        <Entrada
          type="number"
          min={1}
          required
          value={pesos}
          onChange={(evento) => setPesos(evento.target.value)}
        />
      </Campo>

      <Campo etiqueta="Medio">
        <Seleccion
          value={medio}
          onChange={(evento) =>
            setMedio(evento.target.value as 'efectivo' | 'qr_mercado_pago' | 'otro')
          }
        >
          <option value="efectivo">Efectivo</option>
          <option value="qr_mercado_pago">QR de Mercado Pago</option>
          <option value="otro">Otro</option>
        </Seleccion>
      </Campo>

      <Campo etiqueta="Concepto">
        <Seleccion
          value={tipo}
          onChange={(evento) => setTipo(evento.target.value as 'senia' | 'saldo')}
        >
          <option value="saldo">Saldo</option>
          <option value="senia">Seña</option>
        </Seleccion>
      </Campo>

      {cobrar.isError && <Aviso tono="error">{mensajeDe(cobrar.error)}</Aviso>}

      <Boton type="submit" disabled={cobrar.isPending}>
        {cobrar.isPending ? 'Registrando…' : 'Registrar cobro'}
      </Boton>
    </form>
  );
}

/**
 * Reintegro.
 *
 * La casilla no es decoración: el contrato de la API exige `confirmacion: true`
 * en el cuerpo, así que sin marcarla el pedido ni siquiera sale. Es la barrera
 * contra devolver plata de más por un clic apurado.
 */
function FormularioReintegro({
  reservaId,
  maximo,
  alGuardar,
}: {
  reservaId: string;
  maximo: number;
  alGuardar: () => void;
}) {
  const [pesos, setPesos] = useState('');
  const [confirmado, setConfirmado] = useState(false);
  const [motivo, setMotivo] = useState('');

  const devolver = useMutation({
    mutationFn: reintegrar,
    onSuccess: () => {
      setConfirmado(false);
      setPesos('');
      alGuardar();
    },
  });

  function enviar(evento: FormEvent) {
    evento.preventDefault();

    if (!confirmado) return;

    devolver.mutate({
      reservaId,
      montoCentavos: Number(pesos) * 100,
      confirmacion: true,
      motivo: motivo === '' ? undefined : motivo,
    });
  }

  if (maximo <= 0) {
    return (
      <div className="space-y-3">
        <h3 className="versales text-nota text-grafito">Reintegrar</h3>
        <p className="text-nota text-humo">No hay nada cobrado que devolver.</p>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-3">
      <h3 className="versales text-nota text-grafito">Reintegrar</h3>

      <Campo etiqueta="Monto en pesos" ayuda={`Hasta ${formatearPrecio(maximo)}.`}>
        <Entrada
          type="number"
          min={1}
          max={Math.round(maximo / 100)}
          required
          value={pesos}
          onChange={(evento) => setPesos(evento.target.value)}
        />
      </Campo>

      <Campo etiqueta="Motivo">
        <Entrada value={motivo} onChange={(evento) => setMotivo(evento.target.value)} />
      </Campo>

      <label className="text-nota flex items-start gap-2">
        <input
          type="checkbox"
          checked={confirmado}
          onChange={(evento) => setConfirmado(evento.target.checked)}
        />
        <span>Confirmo que hay que devolver este dinero.</span>
      </label>

      {devolver.isError && <Aviso tono="error">{mensajeDe(devolver.error)}</Aviso>}

      {devolver.isSuccess && (
        <Aviso tono={devolver.data.ok ? 'exito' : 'atencion'}>{devolver.data.mensaje}</Aviso>
      )}

      <Boton variante="contorno" type="submit" disabled={!confirmado || devolver.isPending}>
        {devolver.isPending ? 'Devolviendo…' : 'Reintegrar'}
      </Boton>
    </form>
  );
}
