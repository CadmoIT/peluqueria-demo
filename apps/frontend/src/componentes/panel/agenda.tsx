'use client';

// Agenda del día: una columna por profesional, el tiempo hacia abajo.
//
// Los bloques se dibujan sobre la **ventana ocupada**, no sobre la que ve el
// cliente: la preparación y la limpieza ocupan al profesional igual que el
// corte, y una grilla que las ignorara mostraría huecos donde no los hay. Se
// marcan con un borde punteado para que se entienda que ese rato no es servicio.
//
// Todo se dibuja en la hora del local, no en la del navegador: un turno de las
// 15:00 en Buenos Aires tiene que verse 15:00 aunque quien mire esté en otro
// país.
import Link from 'next/link';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BloqueAgenda } from '@manly/contratos';

import { Boton, cn } from '@manly/interfaz';

import { usarSesion } from '@/caracteristicas/autenticacion/usar-sesion';
import { obtenerAgenda, obtenerBloqueos, obtenerProfesionalesAdmin } from '@/servicios/panel';
import { formatearHora, formatearPrecio } from '@/utilidades/formato';
import { Cargando, Seleccion, Tarjeta, Vacio } from './primitivos';

/** Ventana que se dibuja, en hora del local. Cubre la jornada más larga posible. */
const HORA_INICIO = 8;
const HORA_FIN = 22;
const MINUTOS_VISIBLES = (HORA_FIN - HORA_INICIO) * 60;

/** Alto de la grilla. Fijo: una hora siempre mide lo mismo. */
const PIXELES_POR_MINUTO = 1.4;

const ZONA = 'America/Argentina/Buenos_Aires';

/**
 * Minutos desde la medianoche del local.
 *
 * Se saca del formateador con zona horaria y no de `getHours()`, que devolvería
 * la hora del navegador.
 */
function minutosDelDia(iso: string): number {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));

  const [horas, minutos] = partes.split(':').map(Number);

  return (horas ?? 0) * 60 + (minutos ?? 0);
}

/** Extremos del día del local, en instantes UTC. */
function limitesDelDia(dia: string): { desde: string; hasta: string } {
  // Buenos Aires es UTC-3 todo el año: no hay horario de verano que corregir.
  const desde = new Date(`${dia}T00:00:00-03:00`);
  const hasta = new Date(desde.getTime() + 86_400_000);

  return { desde: desde.toISOString(), hasta: hasta.toISOString() };
}

/** Hoy, en el día del local, con formato `AAAA-MM-DD`. */
export function hoyLocal(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function sumarDias(dia: string, cantidad: number): string {
  const fecha = new Date(`${dia}T12:00:00-03:00`);

  fecha.setDate(fecha.getDate() + cantidad);

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(fecha);
}

export interface Sucursal {
  id: string;
  nombre: string;
}

/**
 * La sucursal y el día los controla la página.
 *
 * Los formularios de turno nuevo y de bloqueo trabajan sobre lo mismo que se
 * está mirando: si cada componente guardara su propio día, se cargarían turnos
 * en una fecha distinta de la que está en pantalla.
 */
export function Agenda({
  sucursales,
  sucursalId,
  setSucursalId,
  dia,
  setDia,
}: {
  sucursales: Sucursal[];
  sucursalId: string;
  setSucursalId: (valor: string) => void;
  dia: string;
  setDia: (valor: string) => void;
}) {
  const { usuario } = usarSesion();

  const rango = useMemo(() => limitesDelDia(dia), [dia]);

  const agenda = useQuery({
    queryKey: ['panel', 'agenda', sucursalId, dia],
    queryFn: () => obtenerAgenda({ sucursalId, ...rango }),
    enabled: sucursalId !== '',
    // La agenda la comparten varias personas: se refresca sola para que dos no
    // trabajen sobre versiones distintas del mismo día.
    refetchInterval: 60_000,
  });

  const bloqueos = useQuery({
    queryKey: ['panel', 'bloqueos', sucursalId, dia],
    queryFn: () => obtenerBloqueos({ ...rango, sucursalId }),
    enabled: sucursalId !== '',
  });

  const profesionales = useQuery({
    queryKey: ['panel', 'profesionales'],
    queryFn: obtenerProfesionalesAdmin,
    staleTime: 300_000,
  });

  // Las columnas salen del catálogo, no de los turnos: si sólo se dibujaran los
  // profesionales con reservas, un día flojo escondería a quien está libre, que
  // es justo a quien hay que ofrecerle el próximo turno.
  const columnas = useMemo(() => {
    const activos = (profesionales.data ?? [])
      .filter((profesional) => profesional.activo && profesional.sucursalIds.includes(sucursalId))
      .map((profesional) => ({
        id: profesional.id,
        nombre: profesional.nombreVisible ?? profesional.nombre,
      }));

    if (usuario?.rol === 'profesional') {
      return activos.filter((columna) => columna.id === usuario.profesionalId);
    }

    return activos;
  }, [profesionales.data, sucursalId, usuario]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="versales text-nota text-grafito block">Sucursal</span>
          <Seleccion
            value={sucursalId}
            onChange={(evento) => setSucursalId(evento.target.value)}
            className="w-56"
          >
            {sucursales.map((sucursal) => (
              <option key={sucursal.id} value={sucursal.id}>
                {sucursal.nombre}
              </option>
            ))}
          </Seleccion>
        </label>

        <label className="block">
          <span className="versales text-nota text-grafito block">Día</span>
          <input
            type="date"
            value={dia}
            onChange={(evento) => setDia(evento.target.value)}
            className="rounded-manly border-borde bg-papel text-menor focus:border-tinta mt-1 border px-3 py-2 outline-none"
          />
        </label>

        <div className="flex gap-2">
          <Boton variante="contorno" type="button" onClick={() => setDia(sumarDias(dia, -1))}>
            Anterior
          </Boton>
          <Boton variante="contorno" type="button" onClick={() => setDia(hoyLocal())}>
            Hoy
          </Boton>
          <Boton variante="contorno" type="button" onClick={() => setDia(sumarDias(dia, 1))}>
            Siguiente
          </Boton>
        </div>
      </div>

      {(bloqueos.data ?? []).length > 0 && (
        <Tarjeta className="border-atencion/40 bg-atencion/5">
          <p className="versales text-nota text-grafito">Bloqueos del día</p>
          <ul className="text-menor mt-2 space-y-1">
            {(bloqueos.data ?? []).map((bloqueo) => (
              <li key={bloqueo.id}>
                {formatearHora(bloqueo.comienzaEn)}–{formatearHora(bloqueo.terminaEn)} ·{' '}
                {bloqueo.profesionalNombre ?? 'Toda la sucursal'}
                {bloqueo.motivo !== null && ` · ${bloqueo.motivo}`}
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      {agenda.isPending ? (
        <Cargando />
      ) : columnas.length === 0 ? (
        <Vacio>No hay profesionales asignados a esta sucursal.</Vacio>
      ) : (
        <Grilla columnas={columnas} bloques={agenda.data ?? []} />
      )}
    </div>
  );
}

function Grilla({
  columnas,
  bloques,
}: {
  columnas: { id: string; nombre: string }[];
  bloques: BloqueAgenda[];
}) {
  const horas = Array.from({ length: HORA_FIN - HORA_INICIO }, (_, indice) => HORA_INICIO + indice);

  return (
    <div className="rounded-tarjeta border-borde bg-papel overflow-x-auto border">
      <div className="min-w-[40rem]">
        <div
          className="border-borde grid border-b"
          style={{
            gridTemplateColumns: `4rem repeat(${String(columnas.length)}, minmax(9rem, 1fr))`,
          }}
        >
          <div />
          {columnas.map((columna) => (
            <div
              key={columna.id}
              className="versales border-borde text-nota text-grafito border-l px-2 py-2"
            >
              {columna.nombre}
            </div>
          ))}
        </div>

        <div
          className="relative grid"
          style={{
            gridTemplateColumns: `4rem repeat(${String(columnas.length)}, minmax(9rem, 1fr))`,
            height: `${String(MINUTOS_VISIBLES * PIXELES_POR_MINUTO)}px`,
          }}
        >
          <div className="relative">
            {horas.map((hora) => (
              <div
                key={hora}
                className="text-nota text-humo absolute left-0 w-full pr-2 text-right"
                style={{ top: `${String((hora - HORA_INICIO) * 60 * PIXELES_POR_MINUTO)}px` }}
              >
                {String(hora).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {columnas.map((columna) => (
            <div key={columna.id} className="border-borde relative border-l">
              {horas.map((hora) => (
                <div
                  key={hora}
                  className="border-borde/50 absolute w-full border-t"
                  style={{ top: `${String((hora - HORA_INICIO) * 60 * PIXELES_POR_MINUTO)}px` }}
                />
              ))}

              {bloques
                .filter((bloque) => bloque.profesionalId === columna.id)
                .map((bloque) => (
                  <BloqueDibujado key={bloque.bloqueId} bloque={bloque} />
                ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BloqueDibujado({ bloque }: { bloque: BloqueAgenda }) {
  const ocupaDesde = minutosDelDia(bloque.ocupaDesde);
  const ocupaHasta = minutosDelDia(bloque.ocupaHasta);
  const arriba = (ocupaDesde - HORA_INICIO * 60) * PIXELES_POR_MINUTO;
  const alto = Math.max((ocupaHasta - ocupaDesde) * PIXELES_POR_MINUTO, 22);

  const cancelado = bloque.estado === 'cancelada' || bloque.estado === 'expirada';

  return (
    <Link
      href={`/panel/reservas/${bloque.reservaId}`}
      className={cn(
        'rounded-manly text-nota absolute inset-x-1 overflow-hidden border px-2 py-1',
        'duration-(--duracion-rapida) transition-colors',
        // La ventana ocupada incluye preparación y limpieza: el punteado avisa
        // que el bloque dura más de lo que el cliente ve.
        'border-dashed',
        cancelado
          ? 'border-borde bg-niebla text-humo line-through'
          : bloque.estado === 'pendiente_pago'
            ? 'border-atencion bg-atencion/10 text-tinta hover:bg-atencion/20'
            : 'border-tinta bg-tinta/5 text-tinta hover:bg-tinta/10',
      )}
      style={{ top: `${String(arriba)}px`, height: `${String(alto)}px` }}
      title={`${bloque.servicioNombre} · ${formatearPrecio(bloque.precioCentavos)}`}
    >
      <span className="block truncate font-medium">
        {formatearHora(bloque.comienzaEn)} {bloque.clienteNombre ?? 'Sin nombre'}
      </span>
      <span className="text-humo block truncate">
        {bloque.servicioNombre}
        {bloque.bloquesDeLaReserva > 1 &&
          ` · ${String(bloque.orden + 1)}/${String(bloque.bloquesDeLaReserva)}`}
      </span>
    </Link>
  );
}
