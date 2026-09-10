'use client';

// Catálogo: sucursales, servicios y profesionales.
//
// Dos cosas conviene tener presentes al usar esta pantalla, y por eso están
// escritas también en la interfaz:
//
//   1. **Nada se borra.** Se da de baja con la casilla «activo». Un borrado
//      arrastraría reservas históricas, y con ellas el rastro de lo que pasó.
//   2. **Los cambios no alcanzan a los turnos ya tomados.** Precio, duración y
//      buffers se copiaron a la reserva en el momento de reservarla, así que
//      subir un precio hoy no encarece un turno de ayer.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Boton, cn } from '@manly/interfaz';

import {
  Aviso,
  Campo,
  Cargando,
  Entrada,
  Seleccion,
  Tarjeta,
  TituloPanel,
} from '@/componentes/panel/primitivos';
import { ErrorApi } from '@/servicios/api';
import {
  actualizarProfesional,
  actualizarServicio,
  actualizarSucursal,
  crearProfesional,
  crearServicio,
  crearSucursal,
  obtenerProfesionalesAdmin,
  obtenerServiciosAdmin,
  obtenerSucursalesAdmin,
  type ProfesionalAdmin,
  type ServicioAdmin,
  type SucursalAdmin,
} from '@/servicios/panel';
import { formatearPrecio } from '@/utilidades/formato';

type Pestania = 'servicios' | 'sucursales' | 'profesionales';

function mensajeDe(error: unknown): string {
  if (!(error instanceof ErrorApi)) return 'Algo salió mal. Probá de nuevo.';

  return [error.message, ...error.detalles.map((detalle) => detalle.motivo)].join(' ');
}

export default function PaginaCatalogo() {
  const [pestania, setPestania] = useState<Pestania>('servicios');

  return (
    <>
      <TituloPanel>Catálogo</TituloPanel>

      <nav className="border-borde mb-6 flex gap-4 border-b" aria-label="Secciones del catálogo">
        {(['servicios', 'sucursales', 'profesionales'] as const).map((una) => (
          <button
            key={una}
            type="button"
            onClick={() => setPestania(una)}
            aria-current={pestania === una ? 'page' : undefined}
            className={cn(
              'versales text-nota tracking-versales -mb-px border-b-2 px-1 py-2',
              pestania === una
                ? 'border-tinta text-tinta'
                : 'text-grafito hover:text-tinta border-transparent',
            )}
          >
            {una}
          </button>
        ))}
      </nav>

      {pestania === 'servicios' && <Servicios />}
      {pestania === 'sucursales' && <Sucursales />}
      {pestania === 'profesionales' && <Profesionales />}
    </>
  );
}

// ── Servicios ────────────────────────────────────────────────────────────────

const SERVICIO_NUEVO = {
  nombre: '',
  descripcion: null,
  categoria: null,
  duracionMinutos: 45,
  minutosPreparacion: 0,
  minutosLimpieza: 0,
  precioCentavos: 0,
  modalidadSenia: 'deshabilitada' as const,
  seniaFijaCentavos: null,
  seniaPorcentaje: null,
  horasMinimasCancelacion: null,
  activo: true,
  orden: 0,
  sucursalIds: [] as string[],
};

function Servicios() {
  const clientes = useQueryClient();
  const [editando, setEditando] = useState<string | null>(null);

  const servicios = useQuery({ queryKey: ['panel', 'servicios'], queryFn: obtenerServiciosAdmin });
  const sucursales = useQuery({
    queryKey: ['panel', 'sucursales'],
    queryFn: obtenerSucursalesAdmin,
  });

  function refrescar() {
    void clientes.invalidateQueries({ queryKey: ['panel', 'servicios'] });
    setEditando(null);
  }

  if (servicios.isPending || sucursales.isPending) return <Cargando />;

  return (
    <div className="space-y-4">
      {editando === 'nuevo' ? (
        <FormularioServicio
          inicial={{ ...SERVICIO_NUEVO, id: '' }}
          sucursales={sucursales.data ?? []}
          alGuardar={refrescar}
          alCancelar={() => setEditando(null)}
        />
      ) : (
        <Boton type="button" onClick={() => setEditando('nuevo')}>
          Servicio nuevo
        </Boton>
      )}

      <ul className="space-y-3">
        {(servicios.data ?? []).map((servicio) =>
          editando === servicio.id ? (
            <li key={servicio.id}>
              <FormularioServicio
                inicial={servicio}
                sucursales={sucursales.data ?? []}
                alGuardar={refrescar}
                alCancelar={() => setEditando(null)}
              />
            </li>
          ) : (
            <li key={servicio.id}>
              <Tarjeta className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-menor">
                    <strong>{servicio.nombre}</strong>
                    {!servicio.activo && <span className="text-humo ml-2">(inactivo)</span>}
                  </p>
                  <p className="text-nota text-grafito">
                    {servicio.duracionMinutos} min · {formatearPrecio(servicio.precioCentavos)} ·{' '}
                    seña {servicio.modalidadSenia} · {servicio.sucursalIds.length} sucursal(es)
                  </p>
                </div>
                <Boton variante="contorno" type="button" onClick={() => setEditando(servicio.id)}>
                  Editar
                </Boton>
              </Tarjeta>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

function FormularioServicio({
  inicial,
  sucursales,
  alGuardar,
  alCancelar,
}: {
  inicial: ServicioAdmin;
  sucursales: SucursalAdmin[];
  alGuardar: () => void;
  alCancelar: () => void;
}) {
  const [datos, setDatos] = useState(inicial);
  const esNuevo = inicial.id === '';

  const guardar = useMutation({
    // Devuelve void: al que llama sólo le importa que salió bien, y unificar el
    // tipo evita que crear y editar difieran en algo que nadie mira.
    mutationFn: async (): Promise<void> => {
      const { id, ...campos } = datos;

      if (esNuevo) await crearServicio(campos);
      else await actualizarServicio(id, campos);
    },
    onSuccess: alGuardar,
  });

  function cambiar<C extends keyof ServicioAdmin>(campo: C, valor: ServicioAdmin[C]) {
    setDatos((previo) => ({ ...previo, [campo]: valor }));
  }

  return (
    <Tarjeta>
      <form
        onSubmit={(evento) => {
          evento.preventDefault();
          guardar.mutate();
        }}
        className="grid gap-4 sm:grid-cols-2"
      >
        <Campo etiqueta="Nombre">
          <Entrada
            required
            value={datos.nombre}
            onChange={(evento) => cambiar('nombre', evento.target.value)}
          />
        </Campo>

        <Campo etiqueta="Categoría">
          <Entrada
            value={datos.categoria ?? ''}
            onChange={(evento) =>
              cambiar('categoria', evento.target.value === '' ? null : evento.target.value)
            }
          />
        </Campo>

        <Campo etiqueta="Duración en minutos">
          <Entrada
            type="number"
            min={5}
            required
            value={datos.duracionMinutos}
            onChange={(evento) => cambiar('duracionMinutos', Number(evento.target.value))}
          />
        </Campo>

        <Campo etiqueta="Precio en pesos">
          <Entrada
            type="number"
            min={0}
            required
            value={Math.round(datos.precioCentavos / 100)}
            onChange={(evento) => cambiar('precioCentavos', Number(evento.target.value) * 100)}
          />
        </Campo>

        <Campo etiqueta="Preparación" ayuda="Minutos previos que el cliente no ve.">
          <Entrada
            type="number"
            min={0}
            value={datos.minutosPreparacion}
            onChange={(evento) => cambiar('minutosPreparacion', Number(evento.target.value))}
          />
        </Campo>

        <Campo etiqueta="Limpieza" ayuda="Minutos posteriores, tampoco visibles.">
          <Entrada
            type="number"
            min={0}
            value={datos.minutosLimpieza}
            onChange={(evento) => cambiar('minutosLimpieza', Number(evento.target.value))}
          />
        </Campo>

        <Campo etiqueta="Seña">
          <Seleccion
            value={datos.modalidadSenia}
            onChange={(evento) => {
              const modalidad = evento.target.value as ServicioAdmin['modalidadSenia'];

              setDatos((previo) => ({
                ...previo,
                modalidadSenia: modalidad,
                // Los montos se limpian al cambiar de modalidad: la base rechaza
                // una seña fija con porcentaje cargado, y al revés.
                seniaFijaCentavos: modalidad === 'fija' ? (previo.seniaFijaCentavos ?? 0) : null,
                seniaPorcentaje: modalidad === 'porcentual' ? (previo.seniaPorcentaje ?? 30) : null,
              }));
            }}
          >
            <option value="deshabilitada">Sin seña</option>
            <option value="fija">Monto fijo</option>
            <option value="porcentual">Porcentaje</option>
          </Seleccion>
        </Campo>

        {datos.modalidadSenia === 'fija' && (
          <Campo etiqueta="Seña en pesos">
            <Entrada
              type="number"
              min={1}
              required
              value={Math.round((datos.seniaFijaCentavos ?? 0) / 100)}
              onChange={(evento) => cambiar('seniaFijaCentavos', Number(evento.target.value) * 100)}
            />
          </Campo>
        )}

        {datos.modalidadSenia === 'porcentual' && (
          <Campo etiqueta="Porcentaje">
            <Entrada
              type="number"
              min={1}
              max={100}
              required
              value={datos.seniaPorcentaje ?? 30}
              onChange={(evento) => cambiar('seniaPorcentaje', Number(evento.target.value))}
            />
          </Campo>
        )}

        <div className="sm:col-span-2">
          <Campo etiqueta="Descripción">
            <Entrada
              value={datos.descripcion ?? ''}
              onChange={(evento) =>
                cambiar('descripcion', evento.target.value === '' ? null : evento.target.value)
              }
            />
          </Campo>
        </div>

        <fieldset className="sm:col-span-2">
          <legend className="versales text-nota text-grafito">Se presta en</legend>
          <div className="mt-1 flex flex-wrap gap-4">
            {sucursales.map((sucursal) => (
              <label key={sucursal.id} className="text-menor flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={datos.sucursalIds.includes(sucursal.id)}
                  onChange={(evento) =>
                    cambiar(
                      'sucursalIds',
                      evento.target.checked
                        ? [...datos.sucursalIds, sucursal.id]
                        : datos.sucursalIds.filter((uno) => uno !== sucursal.id),
                    )
                  }
                />
                {sucursal.nombre}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="text-menor flex items-center gap-2 sm:col-span-2">
          <input
            type="checkbox"
            checked={datos.activo}
            onChange={(evento) => cambiar('activo', evento.target.checked)}
          />
          Activo · si se desmarca deja de ofrecerse, pero no se borra nada
        </label>

        {guardar.isError && (
          <div className="sm:col-span-2">
            <Aviso tono="error">{mensajeDe(guardar.error)}</Aviso>
          </div>
        )}

        <div className="flex gap-2 sm:col-span-2">
          <Boton type="submit" disabled={guardar.isPending}>
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </Boton>
          <Boton variante="texto" type="button" onClick={alCancelar}>
            Cancelar
          </Boton>
        </div>
      </form>
    </Tarjeta>
  );
}

// ── Sucursales ───────────────────────────────────────────────────────────────

function Sucursales() {
  const clientes = useQueryClient();
  const [editando, setEditando] = useState<string | null>(null);

  const sucursales = useQuery({
    queryKey: ['panel', 'sucursales'],
    queryFn: obtenerSucursalesAdmin,
  });

  function refrescar() {
    void clientes.invalidateQueries({ queryKey: ['panel', 'sucursales'] });
    setEditando(null);
  }

  if (sucursales.isPending) return <Cargando />;

  const vacia: SucursalAdmin = {
    id: '',
    nombre: '',
    barrio: '',
    direccion: '',
    telefono: null,
    whatsapp: null,
    urlMapa: null,
    horasMinimasCancelacion: null,
    activa: true,
    orden: 0,
  };

  return (
    <div className="space-y-4">
      {editando === 'nuevo' ? (
        <FormularioSucursal
          inicial={vacia}
          alGuardar={refrescar}
          alCancelar={() => setEditando(null)}
        />
      ) : (
        <Boton type="button" onClick={() => setEditando('nuevo')}>
          Sucursal nueva
        </Boton>
      )}

      <ul className="space-y-3">
        {(sucursales.data ?? []).map((sucursal) =>
          editando === sucursal.id ? (
            <li key={sucursal.id}>
              <FormularioSucursal
                inicial={sucursal}
                alGuardar={refrescar}
                alCancelar={() => setEditando(null)}
              />
            </li>
          ) : (
            <li key={sucursal.id}>
              <Tarjeta className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-menor">
                    <strong>{sucursal.nombre}</strong>
                    {!sucursal.activa && <span className="text-humo ml-2">(inactiva)</span>}
                  </p>
                  <p className="text-nota text-grafito">
                    {sucursal.barrio} · {sucursal.direccion}
                  </p>
                </div>
                <Boton variante="contorno" type="button" onClick={() => setEditando(sucursal.id)}>
                  Editar
                </Boton>
              </Tarjeta>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

function FormularioSucursal({
  inicial,
  alGuardar,
  alCancelar,
}: {
  inicial: SucursalAdmin;
  alGuardar: () => void;
  alCancelar: () => void;
}) {
  const [datos, setDatos] = useState(inicial);
  const esNueva = inicial.id === '';

  const guardar = useMutation({
    mutationFn: async (): Promise<void> => {
      const { id, ...campos } = datos;

      if (esNueva) await crearSucursal(campos);
      else await actualizarSucursal(id, campos);
    },
    onSuccess: alGuardar,
  });

  function cambiar<C extends keyof SucursalAdmin>(campo: C, valor: SucursalAdmin[C]) {
    setDatos((previo) => ({ ...previo, [campo]: valor }));
  }

  return (
    <Tarjeta>
      <form
        onSubmit={(evento) => {
          evento.preventDefault();
          guardar.mutate();
        }}
        className="grid gap-4 sm:grid-cols-2"
      >
        <Campo etiqueta="Nombre">
          <Entrada
            required
            value={datos.nombre}
            onChange={(evento) => cambiar('nombre', evento.target.value)}
          />
        </Campo>

        <Campo etiqueta="Barrio">
          <Entrada
            required
            value={datos.barrio}
            onChange={(evento) => cambiar('barrio', evento.target.value)}
          />
        </Campo>

        <div className="sm:col-span-2">
          <Campo etiqueta="Dirección">
            <Entrada
              required
              value={datos.direccion}
              onChange={(evento) => cambiar('direccion', evento.target.value)}
            />
          </Campo>
        </div>

        <Campo etiqueta="Teléfono">
          <Entrada
            value={datos.telefono ?? ''}
            onChange={(evento) =>
              cambiar('telefono', evento.target.value === '' ? null : evento.target.value)
            }
          />
        </Campo>

        <Campo etiqueta="WhatsApp" ayuda="Con código de país y sin signos.">
          <Entrada
            value={datos.whatsapp ?? ''}
            onChange={(evento) =>
              cambiar('whatsapp', evento.target.value === '' ? null : evento.target.value)
            }
          />
        </Campo>

        <div className="sm:col-span-2">
          <Campo etiqueta="Enlace al mapa">
            <Entrada
              type="url"
              value={datos.urlMapa ?? ''}
              onChange={(evento) =>
                cambiar('urlMapa', evento.target.value === '' ? null : evento.target.value)
              }
            />
          </Campo>
        </div>

        <Campo etiqueta="Horas mínimas para cancelar" ayuda="Vacío usa la configuración general.">
          <Entrada
            type="number"
            min={0}
            value={datos.horasMinimasCancelacion ?? ''}
            onChange={(evento) =>
              cambiar(
                'horasMinimasCancelacion',
                evento.target.value === '' ? null : Number(evento.target.value),
              )
            }
          />
        </Campo>

        <label className="text-menor flex items-center gap-2">
          <input
            type="checkbox"
            checked={datos.activa}
            onChange={(evento) => cambiar('activa', evento.target.checked)}
          />
          Activa
        </label>

        {guardar.isError && (
          <div className="sm:col-span-2">
            <Aviso tono="error">{mensajeDe(guardar.error)}</Aviso>
          </div>
        )}

        <div className="flex gap-2 sm:col-span-2">
          <Boton type="submit" disabled={guardar.isPending}>
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </Boton>
          <Boton variante="texto" type="button" onClick={alCancelar}>
            Cancelar
          </Boton>
        </div>
      </form>
    </Tarjeta>
  );
}

// ── Profesionales ────────────────────────────────────────────────────────────

function Profesionales() {
  const clientes = useQueryClient();
  const [editando, setEditando] = useState<string | null>(null);

  const profesionales = useQuery({
    queryKey: ['panel', 'profesionales'],
    queryFn: obtenerProfesionalesAdmin,
  });
  const sucursales = useQuery({
    queryKey: ['panel', 'sucursales'],
    queryFn: obtenerSucursalesAdmin,
  });
  const servicios = useQuery({ queryKey: ['panel', 'servicios'], queryFn: obtenerServiciosAdmin });

  function refrescar() {
    void clientes.invalidateQueries({ queryKey: ['panel', 'profesionales'] });
    setEditando(null);
  }

  if (profesionales.isPending || sucursales.isPending || servicios.isPending) return <Cargando />;

  const vacio: ProfesionalAdmin = {
    id: '',
    usuarioId: null,
    nombre: '',
    nombreVisible: null,
    activo: true,
    orden: 0,
    sucursalIds: [],
    servicioIds: [],
  };

  return (
    <div className="space-y-4">
      {editando === 'nuevo' ? (
        <FormularioProfesional
          inicial={vacio}
          sucursales={sucursales.data ?? []}
          servicios={servicios.data ?? []}
          alGuardar={refrescar}
          alCancelar={() => setEditando(null)}
        />
      ) : (
        <Boton type="button" onClick={() => setEditando('nuevo')}>
          Profesional nuevo
        </Boton>
      )}

      <ul className="space-y-3">
        {(profesionales.data ?? []).map((profesional) =>
          editando === profesional.id ? (
            <li key={profesional.id}>
              <FormularioProfesional
                inicial={profesional}
                sucursales={sucursales.data ?? []}
                servicios={servicios.data ?? []}
                alGuardar={refrescar}
                alCancelar={() => setEditando(null)}
              />
            </li>
          ) : (
            <li key={profesional.id}>
              <Tarjeta className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-menor">
                    <strong>{profesional.nombreVisible ?? profesional.nombre}</strong>
                    {!profesional.activo && <span className="text-humo ml-2">(inactivo)</span>}
                  </p>
                  <p className="text-nota text-grafito">
                    {profesional.sucursalIds.length} sucursal(es) · {profesional.servicioIds.length}{' '}
                    servicio(s)
                    {profesional.usuarioId === null && ' · sin acceso al panel'}
                  </p>
                </div>
                <Boton
                  variante="contorno"
                  type="button"
                  onClick={() => setEditando(profesional.id)}
                >
                  Editar
                </Boton>
              </Tarjeta>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

function FormularioProfesional({
  inicial,
  sucursales,
  servicios,
  alGuardar,
  alCancelar,
}: {
  inicial: ProfesionalAdmin;
  sucursales: SucursalAdmin[];
  servicios: ServicioAdmin[];
  alGuardar: () => void;
  alCancelar: () => void;
}) {
  const [datos, setDatos] = useState(inicial);
  const esNuevo = inicial.id === '';

  const guardar = useMutation({
    mutationFn: async (): Promise<void> => {
      // `usuarioId` se descarta: el vínculo con la cuenta del panel se maneja
      // desde Accesos, no desde acá.
      const { id, usuarioId: _, ...campos } = datos;

      if (esNuevo) await crearProfesional(campos);
      else await actualizarProfesional(id, campos);
    },
    onSuccess: alGuardar,
  });

  function cambiar<C extends keyof ProfesionalAdmin>(campo: C, valor: ProfesionalAdmin[C]) {
    setDatos((previo) => ({ ...previo, [campo]: valor }));
  }

  return (
    <Tarjeta>
      <form
        onSubmit={(evento) => {
          evento.preventDefault();
          guardar.mutate();
        }}
        className="grid gap-4 sm:grid-cols-2"
      >
        <Campo etiqueta="Nombre">
          <Entrada
            required
            value={datos.nombre}
            onChange={(evento) => cambiar('nombre', evento.target.value)}
          />
        </Campo>

        <Campo etiqueta="Cómo se lo presenta" ayuda="Vacío muestra el nombre.">
          <Entrada
            value={datos.nombreVisible ?? ''}
            onChange={(evento) =>
              cambiar('nombreVisible', evento.target.value === '' ? null : evento.target.value)
            }
          />
        </Campo>

        <fieldset className="sm:col-span-2">
          <legend className="versales text-nota text-grafito">Atiende en</legend>
          <div className="mt-1 flex flex-wrap gap-4">
            {sucursales.map((sucursal) => (
              <label key={sucursal.id} className="text-menor flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={datos.sucursalIds.includes(sucursal.id)}
                  onChange={(evento) =>
                    cambiar(
                      'sucursalIds',
                      evento.target.checked
                        ? [...datos.sucursalIds, sucursal.id]
                        : datos.sucursalIds.filter((uno) => uno !== sucursal.id),
                    )
                  }
                />
                {sucursal.nombre}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="sm:col-span-2">
          <legend className="versales text-nota text-grafito">Hace</legend>
          <div className="mt-1 flex flex-wrap gap-4">
            {servicios.map((servicio) => (
              <label key={servicio.id} className="text-menor flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={datos.servicioIds.includes(servicio.id)}
                  onChange={(evento) =>
                    cambiar(
                      'servicioIds',
                      evento.target.checked
                        ? [...datos.servicioIds, servicio.id]
                        : datos.servicioIds.filter((uno) => uno !== servicio.id),
                    )
                  }
                />
                {servicio.nombre}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="text-menor flex items-center gap-2 sm:col-span-2">
          <input
            type="checkbox"
            checked={datos.activo}
            onChange={(evento) => cambiar('activo', evento.target.checked)}
          />
          Activo · si se desmarca deja de ofrecerse, pero sus turnos siguen en la agenda
        </label>

        {guardar.isError && (
          <div className="sm:col-span-2">
            <Aviso tono="error">{mensajeDe(guardar.error)}</Aviso>
          </div>
        )}

        <div className="flex gap-2 sm:col-span-2">
          <Boton type="submit" disabled={guardar.isPending}>
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </Boton>
          <Boton variante="texto" type="button" onClick={alCancelar}>
            Cancelar
          </Boton>
        </div>
      </form>
    </Tarjeta>
  );
}
