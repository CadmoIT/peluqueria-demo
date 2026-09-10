'use client';

// Configuración global del negocio.
//
// Son los valores que rigen cuando una sucursal o un servicio no definen el
// suyo. Cada campo lleva escrito qué cambia en la práctica: son pocos números,
// pero mueven cosas caras —cuánto tiempo se sostiene un horario sin pagar, con
// cuánta anticipación se puede cancelar solo, cuándo salen los recordatorios—.
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConfiguracionNegocio } from '@manly/contratos';

import { Boton } from '@manly/interfaz';

import {
  Aviso,
  Campo,
  Cargando,
  Entrada,
  Tarjeta,
  TituloPanel,
} from '@/componentes/panel/primitivos';
import { ErrorApi } from '@/servicios/api';
import { guardarConfiguracion, obtenerConfiguracion } from '@/servicios/panel';

function mensajeDe(error: unknown): string {
  if (!(error instanceof ErrorApi)) return 'Algo salió mal. Probá de nuevo.';

  return [error.message, ...error.detalles.map((detalle) => detalle.motivo)].join(' ');
}

export default function PaginaConfiguracion() {
  const clientes = useQueryClient();
  const [borrador, setBorrador] = useState<ConfiguracionNegocio | null>(null);

  const configuracion = useQuery({
    queryKey: ['panel', 'configuracion'],
    queryFn: obtenerConfiguracion,
  });

  useEffect(() => {
    if (configuracion.data) setBorrador(configuracion.data);
  }, [configuracion.data]);

  const guardar = useMutation({
    mutationFn: (datos: ConfiguracionNegocio) => guardarConfiguracion(datos),
    onSuccess: () => clientes.invalidateQueries({ queryKey: ['panel', 'configuracion'] }),
  });

  if (configuracion.isPending || !borrador) return <Cargando />;

  function cambiar<C extends keyof ConfiguracionNegocio>(campo: C, valor: ConfiguracionNegocio[C]) {
    setBorrador((previo) => (previo ? { ...previo, [campo]: valor } : previo));
  }

  return (
    <>
      <TituloPanel>Ajustes</TituloPanel>

      <Tarjeta className="max-w-2xl">
        <form
          onSubmit={(evento) => {
            evento.preventDefault();
            guardar.mutate(borrador);
          }}
          className="grid gap-5 sm:grid-cols-2"
        >
          <Campo
            etiqueta="Horas mínimas para cancelar"
            ayuda="Dentro de ese plazo, el cliente ya no cancela solo: deja una solicitud."
          >
            <Entrada
              type="number"
              min={0}
              required
              value={borrador.horasMinimasCancelacion}
              onChange={(evento) => cambiar('horasMinimasCancelacion', Number(evento.target.value))}
            />
          </Campo>

          <Campo
            etiqueta="Minutos de retención"
            ayuda="Cuánto se sostiene el horario mientras la persona paga la seña."
          >
            <Entrada
              type="number"
              min={1}
              required
              value={borrador.minutosRetencion}
              onChange={(evento) => cambiar('minutosRetencion', Number(evento.target.value))}
            />
          </Campo>

          <Campo
            etiqueta="Días de horizonte"
            ayuda="Hasta cuándo hacia adelante se muestra disponibilidad."
          >
            <Entrada
              type="number"
              min={1}
              required
              value={borrador.diasHorizonte}
              onChange={(evento) => cambiar('diasHorizonte', Number(evento.target.value))}
            />
          </Campo>

          <Campo
            etiqueta="Servicios por reserva"
            ayuda="Cuántos se pueden encadenar en un mismo turno."
          >
            <Entrada
              type="number"
              min={1}
              max={10}
              required
              value={borrador.maximoServiciosPorReserva}
              onChange={(evento) =>
                cambiar('maximoServiciosPorReserva', Number(evento.target.value))
              }
            />
          </Campo>

          <Campo etiqueta="Primer recordatorio" ayuda="Horas antes del turno.">
            <Entrada
              type="number"
              min={0}
              required
              value={borrador.horasRecordatorioPrimero}
              onChange={(evento) =>
                cambiar('horasRecordatorioPrimero', Number(evento.target.value))
              }
            />
          </Campo>

          <Campo
            etiqueta="Segundo recordatorio"
            ayuda="Vacío lo apaga. Tiene que ser más cerca del turno que el primero."
          >
            <Entrada
              type="number"
              min={0}
              value={borrador.horasRecordatorioSegundo ?? ''}
              onChange={(evento) =>
                cambiar(
                  'horasRecordatorioSegundo',
                  evento.target.value === '' ? null : Number(evento.target.value),
                )
              }
            />
          </Campo>

          <div className="sm:col-span-2">
            <Campo
              etiqueta="Zona horaria"
              ayuda="Toda la agenda se calcula y se muestra en esta zona."
            >
              <Entrada
                required
                value={borrador.zonaHoraria}
                onChange={(evento) => cambiar('zonaHoraria', evento.target.value)}
              />
            </Campo>
          </div>

          {guardar.isError && (
            <div className="sm:col-span-2">
              <Aviso tono="error">{mensajeDe(guardar.error)}</Aviso>
            </div>
          )}

          {guardar.isSuccess && (
            <div className="sm:col-span-2">
              <Aviso tono="exito">Ajustes guardados.</Aviso>
            </div>
          )}

          <div className="sm:col-span-2">
            <Boton type="submit" disabled={guardar.isPending}>
              {guardar.isPending ? 'Guardando…' : 'Guardar'}
            </Boton>
          </div>
        </form>
      </Tarjeta>
    </>
  );
}
