'use client';

// Flujo de reserva completo, en una sola página.
//
// Todos los pasos quedan a la vista y se van habilitando: así se puede volver
// atrás a cambiar algo sin perder el resto, que es lo que la gente hace de
// verdad. Los pasos que todavía no corresponden se ven atenuados.
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { Cargando, cn, Contenedor, EnlaceBoton } from '@manly/interfaz';
import type { OpcionDisponibilidad } from '@manly/contratos';

import { Paso } from '@/componentes/reservas/paso';
import { ResumenReserva } from '@/componentes/reservas/resumen-reserva';
import { TarjetaOpcion } from '@/componentes/reservas/tarjeta-opcion';
import { FormularioDatos } from '@/componentes/reservas/formulario-datos';
import { usarFlujoReserva } from '@/caracteristicas/reservas/usar-flujo-reserva';
import { RUTAS } from '@/utilidades/rutas';
import {
  obtenerConfiguracionPublica,
  obtenerProfesionales,
  obtenerServicios,
  obtenerSucursales,
} from '@/servicios/catalogo';
import { buscarDisponibilidad, retenerHorario } from '@/servicios/reservas';
import {
  claveDelDia,
  formatearDia,
  formatearDuracion,
  formatearPrecio,
} from '@/utilidades/formato';

/** Máximo de servicios por reserva. La API lo vuelve a validar. */
const MAXIMO_SERVICIOS = 4;

/** Cuántos días hacia adelante se piden de una. */
const DIAS_A_BUSCAR = 21;

export function FlujoReserva({ sucursalInicial }: { sucursalInicial?: string }) {
  const router = useRouter();
  const flujo = usarFlujoReserva(sucursalInicial ?? null);
  const { estado, totales } = flujo;

  const sucursales = useQuery({ queryKey: ['sucursales'], queryFn: obtenerSucursales });

  // Si el local cerró las reservas online, se dice acá y no se dibuja el flujo.
  // Lo que de verdad corta es la API —el interruptor se comprueba al retener—,
  // pero hacer pasar a alguien por cuatro pasos para que el último le diga que
  // no es una falta de respeto por su tiempo.
  const configuracion = useQuery({
    queryKey: ['configuracion-publica'],
    queryFn: obtenerConfiguracionPublica,
  });

  const servicios = useQuery({
    queryKey: ['servicios', estado.sucursalId],
    queryFn: () => obtenerServicios(estado.sucursalId!),
    enabled: Boolean(estado.sucursalId),
  });

  const ventana = useMemo(() => {
    const desde = new Date();
    const hasta = new Date(desde.getTime() + DIAS_A_BUSCAR * 24 * 3_600_000);

    return { desde: desde.toISOString(), hasta: hasta.toISOString() };
  }, []);

  const disponibilidad = useQuery({
    queryKey: [
      'disponibilidad',
      estado.sucursalId,
      estado.serviciosElegidos.map((servicio) => servicio.id).join(','),
      JSON.stringify(estado.preferencias),
    ],
    queryFn: () =>
      buscarDisponibilidad({
        sucursalId: estado.sucursalId!,
        servicios: estado.serviciosElegidos.map((servicio) => ({
          servicioId: servicio.id,
          profesionalId: estado.preferencias[servicio.id] ?? null,
        })),
        ...ventana,
      }),
    enabled: Boolean(estado.sucursalId) && estado.serviciosElegidos.length > 0,
  });

  const retencion = useMutation({
    mutationFn: (opcion: OpcionDisponibilidad) =>
      retenerHorario({
        sucursalId: estado.sucursalId!,
        bloques: opcion.bloques.map((bloque) => ({
          servicioId: bloque.servicioId,
          profesionalId: bloque.profesionalId,
          orden: bloque.orden,
          comienzaEn: bloque.comienzaEn,
          terminaEn: bloque.terminaEn,
        })),
      }),
  });

  // Las opciones se agrupan por día del negocio para que el calendario tenga
  // sentido: la gente elige primero el día y después la hora.
  const porDia = useMemo(() => {
    const grupos = new Map<string, OpcionDisponibilidad[]>();

    for (const opcion of disponibilidad.data?.opciones ?? []) {
      const dia = claveDelDia(opcion.comienzaEn);
      const existentes = grupos.get(dia) ?? [];

      existentes.push(opcion);
      grupos.set(dia, existentes);
    }

    return [...grupos.entries()];
  }, [disponibilidad.data]);

  const [diaAbierto, setDiaAbierto] = useState<string | null>(null);
  const diaElegido = diaAbierto ?? porDia[0]?.[0] ?? null;
  const opcionesDelDia = porDia.find(([dia]) => dia === diaElegido)?.[1] ?? [];

  if (configuracion.data && !configuracion.data.reservasOnlineActivas) {
    return (
      <Contenedor className="py-seccion max-w-3xl">
        <h1 className="text-titulo">Reservá tu turno</h1>

        <p className="text-guia text-grafito mt-6">
          {configuracion.data.mensajeReservasCerradas ??
            'Por ahora no estamos tomando turnos online. Escribinos y lo vemos.'}
        </p>

        <EnlaceBoton href={RUTAS.contacto} variante="contorno" className="mt-8">
          Cómo contactarnos
        </EnlaceBoton>
      </Contenedor>
    );
  }

  return (
    <Contenedor className="py-seccion max-w-3xl">
      <h1 className="text-titulo">Reservá tu turno</h1>

      <Paso numero={1} titulo="Sucursal">
        {sucursales.isPending ? (
          <Cargando mensaje="Cargando sucursales…" className="py-6" />
        ) : sucursales.isError ? (
          <p className="text-menor text-error">
            No pudimos cargar las sucursales. Probá de nuevo en un momento.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {sucursales.data?.map((sucursal) => (
              <button
                key={sucursal.id}
                type="button"
                onClick={() => {
                  flujo.elegirSucursal(sucursal.id);
                }}
                aria-pressed={estado.sucursalId === sucursal.id}
                className={cn(
                  'rounded-tarjeta duration-(--duracion-rapida) border p-4 text-left transition-colors',
                  estado.sucursalId === sucursal.id
                    ? 'border-tinta bg-tinta text-lino'
                    : 'border-borde bg-papel hover:border-tinta',
                )}
              >
                <span className="block text-base">{sucursal.nombre}</span>
                <span
                  className={cn(
                    'text-menor',
                    estado.sucursalId === sucursal.id ? 'text-humo' : 'text-grafito',
                  )}
                >
                  {sucursal.barrio}
                </span>
              </button>
            ))}
          </div>
        )}
      </Paso>

      <Paso numero={2} titulo="Servicios" habilitado={Boolean(estado.sucursalId)}>
        {!estado.sucursalId ? (
          <p className="text-menor text-grafito">Elegí primero una sucursal.</p>
        ) : servicios.isPending ? (
          <Cargando mensaje="Cargando servicios…" className="py-6" />
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {servicios.data?.map((servicio) => {
                const elegido = estado.serviciosElegidos.some((otro) => otro.id === servicio.id);
                const tope = estado.serviciosElegidos.length >= MAXIMO_SERVICIOS && !elegido;

                return (
                  <li key={servicio.id}>
                    <button
                      type="button"
                      disabled={tope}
                      onClick={() => {
                        flujo.alternarServicio(servicio, MAXIMO_SERVICIOS);
                      }}
                      aria-pressed={elegido}
                      className={cn(
                        'rounded-tarjeta flex w-full items-center justify-between gap-4 border p-4 text-left',
                        'duration-(--duracion-rapida) transition-colors',
                        elegido ? 'border-tinta' : 'border-borde hover:border-humo',
                        tope && 'cursor-not-allowed opacity-40',
                      )}
                    >
                      <span>
                        <span className="block text-base">{servicio.nombre}</span>
                        <span className="text-menor text-grafito">
                          {formatearDuracion(servicio.duracionMinutos)}
                          {servicio.seniaCentavos > 0
                            ? ` · seña ${formatearPrecio(servicio.seniaCentavos)}`
                            : ''}
                        </span>
                      </span>
                      <span className="text-menor shrink-0">
                        {formatearPrecio(servicio.precioCentavos)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {estado.serviciosElegidos.length >= MAXIMO_SERVICIOS ? (
              <p className="text-nota text-grafito mt-3">
                Podés reservar hasta {MAXIMO_SERVICIOS} servicios juntos.
              </p>
            ) : null}
          </>
        )}
      </Paso>

      <Paso numero={3} titulo="Profesional" habilitado={estado.serviciosElegidos.length > 0}>
        {estado.serviciosElegidos.length === 0 ? (
          <p className="text-menor text-grafito">Elegí al menos un servicio.</p>
        ) : (
          <div className="flex flex-col gap-5">
            {estado.serviciosElegidos.map((servicio) => (
              <SelectorProfesional
                key={servicio.id}
                servicioId={servicio.id}
                servicioNombre={servicio.nombre}
                sucursalId={estado.sucursalId!}
                elegido={estado.preferencias[servicio.id] ?? null}
                onElegir={(profesionalId) => {
                  flujo.elegirProfesional(servicio.id, profesionalId);
                }}
              />
            ))}
          </div>
        )}
      </Paso>

      <Paso numero={4} titulo="Día y horario" habilitado={estado.serviciosElegidos.length > 0}>
        {estado.serviciosElegidos.length === 0 ? (
          <p className="text-menor text-grafito">Elegí al menos un servicio.</p>
        ) : disponibilidad.isPending ? (
          <Cargando mensaje="Buscando horarios…" className="py-6" />
        ) : disponibilidad.isError ? (
          <p className="text-menor text-error">
            No pudimos buscar horarios. Probá de nuevo en un momento.
          </p>
        ) : porDia.length === 0 ? (
          <p className="text-menor text-grafito">
            No hay horarios disponibles con esa combinación. Probá con otro profesional o con menos
            servicios.
          </p>
        ) : (
          <>
            <div
              role="tablist"
              aria-label="Días con turnos"
              className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2"
            >
              {porDia.map(([dia, opciones]) => (
                <button
                  key={dia}
                  role="tab"
                  type="button"
                  aria-selected={dia === diaElegido}
                  onClick={() => {
                    setDiaAbierto(dia);
                    flujo.elegirOpcion(null);
                  }}
                  className={cn(
                    'rounded-manly text-menor min-h-11 shrink-0 whitespace-nowrap border px-4',
                    'duration-(--duracion-rapida) transition-colors',
                    dia === diaElegido
                      ? 'border-tinta bg-tinta text-lino'
                      : 'border-borde bg-papel hover:border-tinta',
                  )}
                >
                  {formatearDia(opciones[0]!.comienzaEn)}
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {opcionesDelDia.map((opcion) => (
                <TarjetaOpcion
                  key={opcion.comienzaEn}
                  comienzaEn={opcion.comienzaEn}
                  seleccionado={estado.opcion?.comienzaEn === opcion.comienzaEn}
                  onElegir={() => {
                    flujo.elegirOpcion(opcion);
                  }}
                />
              ))}
            </div>
          </>
        )}
      </Paso>

      <Paso numero={5} titulo="Tus datos" habilitado={Boolean(estado.opcion)}>
        {!estado.opcion ? (
          <p className="text-menor text-grafito">Elegí un horario para seguir.</p>
        ) : (
          <>
            <ResumenReserva opcion={estado.opcion} totales={totales} />

            <FormularioDatos
              opcion={estado.opcion}
              retener={async () => retencion.mutateAsync(estado.opcion!)}
              onListo={(token) => {
                router.push(`/mi-reserva/${token}?nueva=1`);
              }}
            />
          </>
        )}
      </Paso>
    </Contenedor>
  );
}

/** Selector de profesional para un servicio, con la opción "cualquiera". */
function SelectorProfesional({
  servicioId,
  servicioNombre,
  sucursalId,
  elegido,
  onElegir,
}: {
  servicioId: string;
  servicioNombre: string;
  sucursalId: string;
  elegido: string | null;
  onElegir: (profesionalId: string | null) => void;
}) {
  const profesionales = useQuery({
    queryKey: ['profesionales', servicioId, sucursalId],
    queryFn: () => obtenerProfesionales(servicioId, sucursalId),
  });

  return (
    <fieldset>
      <legend className="text-menor text-grafito mb-2">{servicioNombre}</legend>

      <div className="flex flex-wrap gap-2">
        <BotonProfesional
          etiqueta="Cualquiera"
          seleccionado={elegido === null}
          onElegir={() => {
            onElegir(null);
          }}
        />

        {profesionales.data?.map((profesional) => (
          <BotonProfesional
            key={profesional.id}
            etiqueta={profesional.nombre}
            seleccionado={elegido === profesional.id}
            onElegir={() => {
              onElegir(profesional.id);
            }}
          />
        ))}
      </div>
    </fieldset>
  );
}

function BotonProfesional({
  etiqueta,
  seleccionado,
  onElegir,
}: {
  etiqueta: string;
  seleccionado: boolean;
  onElegir: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onElegir}
      aria-pressed={seleccionado}
      className={cn(
        'rounded-manly text-menor duration-(--duracion-rapida) min-h-11 border px-4 transition-colors',
        seleccionado
          ? 'border-tinta bg-tinta text-lino'
          : 'border-borde bg-papel hover:border-tinta',
      )}
    >
      {etiqueta}
    </button>
  );
}
