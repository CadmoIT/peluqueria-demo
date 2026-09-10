'use client';

// Horario semanal de cada profesional en cada sucursal.
//
// Se guarda la semana entera de una: lo que no quede en la lista deja de
// existir. Editarla franja por franja abriría la puerta a dejar media semana
// aplicada si algo falla en el medio.
//
// **Cambiar el horario no cancela turnos.** Sacarle a alguien el jueves a la
// tarde no toca lo que ya tenía ese jueves: eso se ve en la agenda y se resuelve
// a mano. Cancelar turnos como efecto colateral de editar un horario sería una
// sorpresa cara.
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Boton } from '@manly/interfaz';

import {
  Aviso,
  Cargando,
  Entrada,
  Seleccion,
  Tarjeta,
  TituloPanel,
  Vacio,
} from '@/componentes/panel/primitivos';
import { ErrorApi } from '@/servicios/api';
import {
  guardarHorario,
  obtenerHorarios,
  obtenerProfesionalesAdmin,
  obtenerSucursalesAdmin,
} from '@/servicios/panel';

/** 0 es domingo y 6 es sábado, igual que `Date.getDay()`. */
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

interface Franja {
  diaSemana: number;
  comienza: string;
  termina: string;
}

function mensajeDe(error: unknown): string {
  if (!(error instanceof ErrorApi)) return 'Algo salió mal. Probá de nuevo.';

  return [error.message, ...error.detalles.map((detalle) => detalle.motivo)].join(' ');
}

export default function PaginaHorarios() {
  const clientes = useQueryClient();
  const [profesionalId, setProfesionalId] = useState('');
  const [sucursalId, setSucursalId] = useState('');
  const [franjas, setFranjas] = useState<Franja[]>([]);

  const profesionales = useQuery({
    queryKey: ['panel', 'profesionales'],
    queryFn: obtenerProfesionalesAdmin,
  });
  const sucursales = useQuery({
    queryKey: ['panel', 'sucursales'],
    queryFn: obtenerSucursalesAdmin,
  });

  const horarios = useQuery({
    queryKey: ['panel', 'horarios', profesionalId, sucursalId],
    queryFn: () => obtenerHorarios({ profesionalId, sucursalId }),
    enabled: profesionalId !== '' && sucursalId !== '',
  });

  // La lista editable se siembra con lo guardado cada vez que cambia la
  // combinación. Se hace en un efecto y no al vuelo porque a partir de ahí es
  // un borrador: se toca hasta que se aprieta guardar.
  useEffect(() => {
    if (horarios.data) {
      setFranjas(
        horarios.data.map((franja) => ({
          diaSemana: franja.diaSemana,
          comienza: franja.comienza.slice(0, 5),
          termina: franja.termina.slice(0, 5),
        })),
      );
    }
  }, [horarios.data]);

  const guardar = useMutation({
    mutationFn: () => guardarHorario({ profesionalId, sucursalId, franjas }),
    onSuccess: () => {
      void clientes.invalidateQueries({ queryKey: ['panel', 'horarios'] });
    },
  });

  if (profesionales.isPending || sucursales.isPending) return <Cargando />;

  const elegido = (profesionales.data ?? []).find((uno) => uno.id === profesionalId);
  const susSucursales = (sucursales.data ?? []).filter(
    (una) => elegido?.sucursalIds.includes(una.id) ?? false,
  );

  return (
    <>
      <TituloPanel>Horarios</TituloPanel>

      <div className="mb-6 flex flex-wrap gap-3">
        <label className="block">
          <span className="versales text-nota text-grafito block">Profesional</span>
          <Seleccion
            value={profesionalId}
            onChange={(evento) => {
              setProfesionalId(evento.target.value);
              setSucursalId('');
              setFranjas([]);
            }}
            className="w-56"
          >
            <option value="">Elegí</option>
            {(profesionales.data ?? []).map((uno) => (
              <option key={uno.id} value={uno.id}>
                {uno.nombreVisible ?? uno.nombre}
              </option>
            ))}
          </Seleccion>
        </label>

        <label className="block">
          <span className="versales text-nota text-grafito block">Sucursal</span>
          <Seleccion
            value={sucursalId}
            onChange={(evento) => setSucursalId(evento.target.value)}
            disabled={profesionalId === ''}
            className="w-56"
          >
            <option value="">Elegí</option>
            {susSucursales.map((una) => (
              <option key={una.id} value={una.id}>
                {una.nombre}
              </option>
            ))}
          </Seleccion>
        </label>
      </div>

      {profesionalId === '' || sucursalId === '' ? (
        <Vacio>Elegí un profesional y una sucursal para ver su semana.</Vacio>
      ) : (
        <Tarjeta>
          <ul className="space-y-2">
            {franjas.map((franja, indice) => (
              // El índice como clave alcanza: la lista sólo se reordena al
              // guardar, que la vuelve a cargar desde la API.
              <li key={indice} className="flex flex-wrap items-center gap-2">
                <Seleccion
                  value={String(franja.diaSemana)}
                  onChange={(evento) =>
                    setFranjas(
                      franjas.map((una, otro) =>
                        otro === indice ? { ...una, diaSemana: Number(evento.target.value) } : una,
                      ),
                    )
                  }
                  className="w-36"
                >
                  {DIAS.map((dia, valor) => (
                    <option key={dia} value={valor}>
                      {dia}
                    </option>
                  ))}
                </Seleccion>

                <Entrada
                  type="time"
                  value={franja.comienza}
                  onChange={(evento) =>
                    setFranjas(
                      franjas.map((una, otro) =>
                        otro === indice ? { ...una, comienza: evento.target.value } : una,
                      ),
                    )
                  }
                  className="w-32"
                />

                <span className="text-grafito">a</span>

                <Entrada
                  type="time"
                  value={franja.termina}
                  onChange={(evento) =>
                    setFranjas(
                      franjas.map((una, otro) =>
                        otro === indice ? { ...una, termina: evento.target.value } : una,
                      ),
                    )
                  }
                  className="w-32"
                />

                <button
                  type="button"
                  className="text-nota text-error underline underline-offset-4"
                  onClick={() => setFranjas(franjas.filter((_, otro) => otro !== indice))}
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>

          {franjas.length === 0 && (
            <p className="text-menor text-humo">
              Sin franjas: este profesional no atiende en esta sucursal.
            </p>
          )}

          <div className="border-borde mt-4 flex flex-wrap gap-2 border-t pt-4">
            <Boton
              variante="contorno"
              type="button"
              onClick={() =>
                setFranjas([...franjas, { diaSemana: 1, comienza: '10:00', termina: '20:00' }])
              }
            >
              Agregar franja
            </Boton>

            <Boton type="button" disabled={guardar.isPending} onClick={() => guardar.mutate()}>
              {guardar.isPending ? 'Guardando…' : 'Guardar la semana'}
            </Boton>
          </div>

          {guardar.isError && (
            <div className="mt-3">
              <Aviso tono="error">{mensajeDe(guardar.error)}</Aviso>
            </div>
          )}

          {guardar.isSuccess && (
            <div className="mt-3">
              <Aviso tono="exito">
                Semana guardada. Los turnos que ya estaban tomados no se tocaron: revisá la agenda
                si sacaste alguna franja.
              </Aviso>
            </div>
          )}
        </Tarjeta>
      )}
    </>
  );
}
