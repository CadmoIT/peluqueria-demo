'use client';

// Historial de acciones administrativas.
//
// Sólo lectura, y no hay forma de borrar desde acá: un registro que se pudiera
// retocar desde el mismo panel que audita no serviría para averiguar quién
// cambió un precio o canceló un turno.
//
// Se muestran los valores de antes y de después porque saber que alguien tocó
// un precio dice poco si no queda de cuánto a cuánto.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Boton } from '@manly/interfaz';

import { Cargando, Seleccion, Tarjeta, TituloPanel, Vacio } from '@/componentes/panel/primitivos';
import { obtenerAuditoria } from '@/servicios/panel';

const POR_PAGINA = 25;

const ENTIDADES = [
  { valor: '', etiqueta: 'Todo' },
  { valor: 'reservas', etiqueta: 'Reservas' },
  { valor: 'pagos', etiqueta: 'Pagos' },
  { valor: 'servicios', etiqueta: 'Servicios' },
  { valor: 'sucursales', etiqueta: 'Sucursales' },
  { valor: 'profesionales', etiqueta: 'Profesionales' },
  { valor: 'horarios_semanales', etiqueta: 'Horarios' },
  { valor: 'usuarios', etiqueta: 'Accesos' },
  { valor: 'solicitudes_cambio', etiqueta: 'Solicitudes' },
  { valor: 'excepciones_horario', etiqueta: 'Bloqueos' },
  { valor: 'configuracion_negocio', etiqueta: 'Ajustes' },
];

function fechaLegible(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    dateStyle: 'short',
    timeStyle: 'short',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

export default function PaginaAuditoria() {
  const [entidad, setEntidad] = useState('');
  const [pagina, setPagina] = useState(1);

  const auditoria = useQuery({
    queryKey: ['panel', 'auditoria', entidad, pagina],
    queryFn: () =>
      obtenerAuditoria({
        entidad: entidad === '' ? undefined : entidad,
        pagina,
        porPagina: POR_PAGINA,
      }),
  });

  const total = auditoria.data?.total ?? 0;
  const paginas = Math.max(Math.ceil(total / POR_PAGINA), 1);

  return (
    <>
      <TituloPanel
        accion={
          <Seleccion
            value={entidad}
            onChange={(evento) => {
              setEntidad(evento.target.value);
              setPagina(1);
            }}
            className="w-52"
          >
            {ENTIDADES.map((una) => (
              <option key={una.valor} value={una.valor}>
                {una.etiqueta}
              </option>
            ))}
          </Seleccion>
        }
      >
        Historial
      </TituloPanel>

      {auditoria.isPending ? (
        <Cargando />
      ) : (auditoria.data?.entradas ?? []).length === 0 ? (
        <Vacio>Todavía no hay nada registrado con ese filtro.</Vacio>
      ) : (
        <>
          <ul className="space-y-2">
            {(auditoria.data?.entradas ?? []).map((entrada) => (
              <li key={entrada.id}>
                <Tarjeta className="p-3">
                  <div className="text-menor flex flex-wrap items-baseline justify-between gap-2">
                    <span>
                      <strong>{entrada.usuarioNombre ?? 'El sistema'}</strong> ·{' '}
                      {entrada.accion.replace(/[._]/g, ' ')}
                    </span>
                    <span className="text-nota text-humo">{fechaLegible(entrada.creadoEn)}</span>
                  </div>

                  {(entrada.datosAntes !== null || entrada.datosDespues !== null) && (
                    <details className="mt-2">
                      <summary className="text-nota text-grafito cursor-pointer">
                        Ver el cambio
                      </summary>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <Volcado titulo="Antes" datos={entrada.datosAntes} />
                        <Volcado titulo="Después" datos={entrada.datosDespues} />
                      </div>
                    </details>
                  )}
                </Tarjeta>
              </li>
            ))}
          </ul>

          <div className="text-menor mt-6 flex items-center justify-between gap-4">
            <Boton
              variante="contorno"
              type="button"
              disabled={pagina <= 1}
              onClick={() => setPagina(pagina - 1)}
            >
              Anterior
            </Boton>

            <span className="text-grafito">
              Página {pagina} de {paginas} · {total} registro(s)
            </span>

            <Boton
              variante="contorno"
              type="button"
              disabled={pagina >= paginas}
              onClick={() => setPagina(pagina + 1)}
            >
              Siguiente
            </Boton>
          </div>
        </>
      )}
    </>
  );
}

function Volcado({ titulo, datos }: { titulo: string; datos: unknown }) {
  if (datos === null || datos === undefined) {
    return (
      <div>
        <p className="versales text-nota text-humo">{titulo}</p>
        <p className="text-nota text-humo">—</p>
      </div>
    );
  }

  return (
    <div>
      <p className="versales text-nota text-humo">{titulo}</p>
      <pre className="rounded-manly bg-niebla text-nota mt-1 overflow-x-auto p-2">
        {JSON.stringify(datos, null, 2)}
      </pre>
    </div>
  );
}
