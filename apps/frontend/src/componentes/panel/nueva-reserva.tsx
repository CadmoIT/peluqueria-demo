'use client';

// Carga de un turno a mano y bloqueo de una franja.
//
// El formulario de reserva **no busca disponibilidad**: quien atiende el
// mostrador ya está mirando la agenda y sabe qué hueco quiere. Se manda el
// horario y la API contesta si entra o no. Un buscador de opciones acá haría más
// lento lo que tiene que ser rápido, y la validación real ocurre igual del otro
// lado.
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Boton } from '@manly/interfaz';

import { ErrorApi } from '@/servicios/api';
import {
  crearBloqueo,
  crearReservaManual,
  obtenerProfesionalesAdmin,
  obtenerServiciosAdmin,
} from '@/servicios/panel';
import { Aviso, Campo, Entrada, Seleccion, Tarjeta } from './primitivos';

const ZONA_HORARIA_LOCAL = '-03:00';

/** Pasa `AAAA-MM-DD` y `HH:MM` del local al instante ISO que espera la API. */
function instante(dia: string, hora: string): string {
  return new Date(`${dia}T${hora}:00${ZONA_HORARIA_LOCAL}`).toISOString();
}

function mensajeDe(error: unknown): string {
  if (!(error instanceof ErrorApi)) return 'Algo salió mal. Probá de nuevo.';

  return [error.message, ...error.detalles.map((detalle) => detalle.motivo)].join(' ');
}

export function NuevaReserva({
  sucursalId,
  dia,
  alGuardar,
}: {
  sucursalId: string;
  dia: string;
  alGuardar: () => void;
}) {
  const clientes = useQueryClient();
  const [servicioId, setServicioId] = useState('');
  const [profesionalId, setProfesionalId] = useState('');
  const [fecha, setFecha] = useState(dia);
  const [hora, setHora] = useState('10:00');
  const [nombre, setNombre] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [notas, setNotas] = useState('');
  const [avisar, setAvisar] = useState(false);

  const servicios = useQuery({
    queryKey: ['panel', 'servicios'],
    queryFn: obtenerServiciosAdmin,
    staleTime: 300_000,
  });

  const profesionales = useQuery({
    queryKey: ['panel', 'profesionales'],
    queryFn: obtenerProfesionalesAdmin,
    staleTime: 300_000,
  });

  const guardar = useMutation({
    mutationFn: crearReservaManual,
    onSuccess: () => {
      void clientes.invalidateQueries({ queryKey: ['panel', 'agenda'] });
      alGuardar();
    },
  });

  const servicio = (servicios.data ?? []).find((uno) => uno.id === servicioId);

  const disponibles = (servicios.data ?? []).filter(
    (uno) => uno.activo && uno.sucursalIds.includes(sucursalId),
  );

  // Sólo quien presta ese servicio en esa sucursal: ofrecer a alguien que no lo
  // hace garantiza un error del otro lado.
  const habilitados = (profesionales.data ?? []).filter(
    (uno) =>
      uno.activo &&
      uno.sucursalIds.includes(sucursalId) &&
      (servicioId === '' || uno.servicioIds.includes(servicioId)),
  );

  function enviar(evento: FormEvent) {
    evento.preventDefault();

    if (!servicio) return;

    const comienzaEn = instante(fecha, hora);

    guardar.mutate({
      sucursalId,
      bloques: [
        {
          servicioId,
          profesionalId,
          orden: 0,
          comienzaEn,
          // La duración la manda el servicio; la API la recalcula igual y
          // rechaza el pedido si no coincide.
          terminaEn: new Date(
            new Date(comienzaEn).getTime() + servicio.duracionMinutos * 60_000,
          ).toISOString(),
        },
      ],
      clienteNombre: nombre,
      contactoWhatsapp: whatsapp === '' ? null : whatsapp,
      contactoEmail: email === '' ? null : email,
      notas: notas === '' ? null : notas,
      avisar,
    });
  }

  const sinContacto = whatsapp === '' && email === '';

  return (
    <Tarjeta>
      <h2 className="versales text-nota tracking-versales text-grafito mb-4">Turno nuevo</h2>

      <form onSubmit={enviar} className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Servicio">
          <Seleccion
            required
            value={servicioId}
            onChange={(evento) => {
              setServicioId(evento.target.value);
              setProfesionalId('');
            }}
          >
            <option value="">Elegí</option>
            {disponibles.map((uno) => (
              <option key={uno.id} value={uno.id}>
                {uno.nombre} · {String(uno.duracionMinutos)} min
              </option>
            ))}
          </Seleccion>
        </Campo>

        <Campo etiqueta="Profesional">
          <Seleccion
            required
            value={profesionalId}
            onChange={(evento) => setProfesionalId(evento.target.value)}
          >
            <option value="">Elegí</option>
            {habilitados.map((uno) => (
              <option key={uno.id} value={uno.id}>
                {uno.nombreVisible ?? uno.nombre}
              </option>
            ))}
          </Seleccion>
        </Campo>

        <Campo etiqueta="Día">
          <Entrada
            type="date"
            required
            value={fecha}
            onChange={(evento) => setFecha(evento.target.value)}
          />
        </Campo>

        <Campo etiqueta="Hora">
          <Entrada
            type="time"
            required
            step={300}
            value={hora}
            onChange={(evento) => setHora(evento.target.value)}
          />
        </Campo>

        <Campo etiqueta="Nombre del cliente">
          <Entrada
            required
            minLength={2}
            value={nombre}
            onChange={(evento) => setNombre(evento.target.value)}
          />
        </Campo>

        <Campo etiqueta="WhatsApp" ayuda="Opcional. Con código de país y sin signos.">
          <Entrada
            inputMode="tel"
            value={whatsapp}
            onChange={(evento) => setWhatsapp(evento.target.value)}
          />
        </Campo>

        <Campo etiqueta="Correo" ayuda="Opcional.">
          <Entrada
            type="email"
            value={email}
            onChange={(evento) => setEmail(evento.target.value)}
          />
        </Campo>

        <Campo etiqueta="Notas" ayuda="Lo que convenga recordar del turno.">
          <Entrada value={notas} onChange={(evento) => setNotas(evento.target.value)} />
        </Campo>

        <label className="text-menor flex items-center gap-2 sm:col-span-2">
          <input
            type="checkbox"
            checked={avisar && !sinContacto}
            disabled={sinContacto}
            onChange={(evento) => setAvisar(evento.target.checked)}
          />
          <span className={sinContacto ? 'text-humo' : undefined}>
            Mandarle la confirmación
            {sinContacto && ' (hace falta un WhatsApp o un correo)'}
          </span>
        </label>

        {guardar.isError && (
          <div className="sm:col-span-2">
            <Aviso tono="error">{mensajeDe(guardar.error)}</Aviso>
          </div>
        )}

        <div className="sm:col-span-2">
          <Boton type="submit" disabled={guardar.isPending}>
            {guardar.isPending ? 'Guardando…' : 'Cargar turno'}
          </Boton>
        </div>
      </form>
    </Tarjeta>
  );
}

/**
 * Bloquea una franja de la agenda.
 *
 * El bloqueo tapa la disponibilidad futura; **no cancela** lo que ya estaba
 * tomado. Los turnos que quedan adentro se listan al guardar para que alguien
 * los resuelva, porque borrárselos al cliente sin avisar sería peor.
 */
export function NuevoBloqueo({
  sucursalId,
  dia,
  alGuardar,
}: {
  sucursalId: string;
  dia: string;
  alGuardar: () => void;
}) {
  const clientes = useQueryClient();
  const [profesionalId, setProfesionalId] = useState('');
  const [fecha, setFecha] = useState(dia);
  const [desde, setDesde] = useState('10:00');
  const [hasta, setHasta] = useState('13:00');
  const [motivo, setMotivo] = useState('');

  const profesionales = useQuery({
    queryKey: ['panel', 'profesionales'],
    queryFn: obtenerProfesionalesAdmin,
    staleTime: 300_000,
  });

  const guardar = useMutation({
    mutationFn: crearBloqueo,
    onSuccess: () => {
      void clientes.invalidateQueries({ queryKey: ['panel', 'bloqueos'] });
      void clientes.invalidateQueries({ queryKey: ['panel', 'agenda'] });
    },
  });

  function enviar(evento: FormEvent) {
    evento.preventDefault();

    guardar.mutate({
      profesionalId: profesionalId === '' ? null : profesionalId,
      sucursalId,
      tipo: 'bloqueo',
      comienzaEn: instante(fecha, desde),
      terminaEn: instante(fecha, hasta),
      motivo: motivo === '' ? null : motivo,
    });
  }

  return (
    <Tarjeta>
      <h2 className="versales text-nota tracking-versales text-grafito mb-4">Bloquear franja</h2>

      <form onSubmit={enviar} className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Profesional" ayuda="Vacío bloquea toda la sucursal.">
          <Seleccion
            value={profesionalId}
            onChange={(evento) => setProfesionalId(evento.target.value)}
          >
            <option value="">Toda la sucursal</option>
            {(profesionales.data ?? [])
              .filter((uno) => uno.sucursalIds.includes(sucursalId))
              .map((uno) => (
                <option key={uno.id} value={uno.id}>
                  {uno.nombreVisible ?? uno.nombre}
                </option>
              ))}
          </Seleccion>
        </Campo>

        <Campo etiqueta="Día">
          <Entrada
            type="date"
            required
            value={fecha}
            onChange={(evento) => setFecha(evento.target.value)}
          />
        </Campo>

        <Campo etiqueta="Desde">
          <Entrada
            type="time"
            required
            value={desde}
            onChange={(evento) => setDesde(evento.target.value)}
          />
        </Campo>

        <Campo etiqueta="Hasta">
          <Entrada
            type="time"
            required
            value={hasta}
            onChange={(evento) => setHasta(evento.target.value)}
          />
        </Campo>

        <div className="sm:col-span-2">
          <Campo etiqueta="Motivo" ayuda="Opcional, pero ayuda a entenderlo después.">
            <Entrada value={motivo} onChange={(evento) => setMotivo(evento.target.value)} />
          </Campo>
        </div>

        {guardar.isError && (
          <div className="sm:col-span-2">
            <Aviso tono="error">{mensajeDe(guardar.error)}</Aviso>
          </div>
        )}

        {guardar.isSuccess && (
          <div className="space-y-2 sm:col-span-2">
            {guardar.data.reservasAfectadas.length === 0 ? (
              <Aviso tono="exito">Franja bloqueada. No había turnos adentro.</Aviso>
            ) : (
              <Aviso tono="atencion">
                Franja bloqueada, pero quedaron {guardar.data.reservasAfectadas.length} turno(s)
                adentro. El bloqueo no los cancela: hay que resolverlos a mano.
              </Aviso>
            )}
            <Boton variante="contorno" type="button" onClick={alGuardar}>
              Cerrar
            </Boton>
          </div>
        )}

        {!guardar.isSuccess && (
          <div className="sm:col-span-2">
            <Boton type="submit" disabled={guardar.isPending}>
              {guardar.isPending ? 'Bloqueando…' : 'Bloquear'}
            </Boton>
          </div>
        )}
      </form>
    </Tarjeta>
  );
}
