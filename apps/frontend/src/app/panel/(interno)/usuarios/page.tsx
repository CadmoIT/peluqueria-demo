'use client';

// Accesos al panel.
//
// No hay registro: se entra sólo por invitación. El enlace que devuelve una
// invitación **es la única vez que existe** —en la base queda sólo su hash—, así
// que se muestra una vez y hay que copiarlo en ese momento.
//
// Dar de baja corta el acceso en el acto: el servidor le cierra las sesiones
// abiertas, no espera a que venza la cookie.
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Boton } from '@manly/interfaz';

import { usarSesion } from '@/caracteristicas/autenticacion/usar-sesion';
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
  cambiarActivo,
  invitar,
  obtenerProfesionalesAdmin,
  obtenerUsuarios,
  vincularProfesional,
} from '@/servicios/panel';

function mensajeDe(error: unknown): string {
  if (!(error instanceof ErrorApi)) return 'Algo salió mal. Probá de nuevo.';

  return [error.message, ...error.detalles.map((detalle) => detalle.motivo)].join(' ');
}

export default function PaginaUsuarios() {
  const clientes = useQueryClient();
  const { usuario: yo } = usarSesion();

  const usuarios = useQuery({ queryKey: ['panel', 'usuarios'], queryFn: obtenerUsuarios });
  const profesionales = useQuery({
    queryKey: ['panel', 'profesionales'],
    queryFn: obtenerProfesionalesAdmin,
  });

  const activar = useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) => cambiarActivo(id, activo),
    onSuccess: () => clientes.invalidateQueries({ queryKey: ['panel', 'usuarios'] }),
  });

  const vincular = useMutation({
    mutationFn: ({
      profesionalId,
      usuarioId,
    }: {
      profesionalId: string;
      usuarioId: string | null;
    }) => vincularProfesional(profesionalId, usuarioId),
    onSuccess: () => {
      void clientes.invalidateQueries({ queryKey: ['panel', 'usuarios'] });
      void clientes.invalidateQueries({ queryKey: ['panel', 'profesionales'] });
    },
  });

  if (usuarios.isPending || profesionales.isPending) return <Cargando />;

  const sinVincular = (profesionales.data ?? []).filter(
    (profesional) => profesional.usuarioId === null,
  );

  return (
    <>
      <TituloPanel>Accesos</TituloPanel>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <ul className="space-y-3">
          {(usuarios.data ?? []).map((usuario) => (
            <li key={usuario.id}>
              <Tarjeta className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-menor">
                    <strong>{usuario.nombre}</strong>
                    {!usuario.activo && <span className="text-humo ml-2">(dado de baja)</span>}
                    {usuario.id === yo?.id && <span className="text-humo ml-2">(vos)</span>}
                  </p>
                  <p className="text-nota text-grafito">
                    {usuario.email} · {usuario.rol}
                    {!usuario.acceso && ' · invitación sin aceptar'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {usuario.rol === 'profesional' &&
                    usuario.profesionalId === null &&
                    sinVincular.length > 0 && (
                      <Seleccion
                        className="w-48"
                        defaultValue=""
                        onChange={(evento) => {
                          if (evento.target.value !== '') {
                            vincular.mutate({
                              profesionalId: evento.target.value,
                              usuarioId: usuario.id,
                            });
                          }
                        }}
                      >
                        <option value="">Asociar con…</option>
                        {sinVincular.map((profesional) => (
                          <option key={profesional.id} value={profesional.id}>
                            {profesional.nombreVisible ?? profesional.nombre}
                          </option>
                        ))}
                      </Seleccion>
                    )}

                  <Boton
                    variante="contorno"
                    type="button"
                    disabled={usuario.id === yo?.id || activar.isPending}
                    onClick={() => activar.mutate({ id: usuario.id, activo: !usuario.activo })}
                  >
                    {usuario.activo ? 'Dar de baja' : 'Reactivar'}
                  </Boton>
                </div>
              </Tarjeta>
            </li>
          ))}

          {activar.isError && <Aviso tono="error">{mensajeDe(activar.error)}</Aviso>}
        </ul>

        <FormularioInvitacion />
      </div>

      {sinVincular.length > 0 && (
        <p className="text-nota text-humo mt-6">
          Sin usuario asociado: {sinVincular.map((uno) => uno.nombre).join(', ')}. Hasta asociarlos
          no pueden ver su agenda.
        </p>
      )}
    </>
  );
}

function FormularioInvitacion() {
  const clientes = useQueryClient();
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState<'gerencia' | 'profesional'>('profesional');

  const invitacion = useMutation({
    mutationFn: invitar,
    onSuccess: () => {
      void clientes.invalidateQueries({ queryKey: ['panel', 'usuarios'] });
      setEmail('');
      setNombre('');
    },
  });

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    invitacion.mutate({ email, nombre, rol });
  }

  return (
    <Tarjeta className="h-fit">
      <h2 className="versales text-nota tracking-versales text-grafito mb-4">Invitar</h2>

      <form onSubmit={enviar} className="space-y-4">
        <Campo etiqueta="Nombre">
          <Entrada
            required
            minLength={2}
            value={nombre}
            onChange={(evento) => setNombre(evento.target.value)}
          />
        </Campo>

        <Campo etiqueta="Correo">
          <Entrada
            type="email"
            required
            value={email}
            onChange={(evento) => setEmail(evento.target.value)}
          />
        </Campo>

        <Campo etiqueta="Rol">
          <Seleccion
            value={rol}
            onChange={(evento) => setRol(evento.target.value as 'gerencia' | 'profesional')}
          >
            <option value="profesional">Profesional · ve sólo su agenda</option>
            <option value="gerencia">Gerencia · ve y administra todo</option>
          </Seleccion>
        </Campo>

        {invitacion.isError && <Aviso tono="error">{mensajeDe(invitacion.error)}</Aviso>}

        <Boton type="submit" className="w-full" disabled={invitacion.isPending}>
          {invitacion.isPending ? 'Creando…' : 'Crear invitación'}
        </Boton>
      </form>

      {invitacion.isSuccess && (
        <div className="mt-4 space-y-2">
          <Aviso tono="atencion">
            Copiá el enlace ahora: no se puede volver a ver. Vence en 7 días.
          </Aviso>
          <code className="rounded-manly bg-niebla text-nota block overflow-x-auto p-2">
            {invitacion.data.url}
          </code>
        </div>
      )}
    </Tarjeta>
  );
}
