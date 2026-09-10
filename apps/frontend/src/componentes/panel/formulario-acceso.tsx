'use client';

// Formularios de acceso al panel: ingreso, invitación y recuperación.
//
// Los tres comparten la misma forma —una tarjeta con dos campos y un botón— y
// las mismas reglas, así que viven juntos: separarlos en tres archivos casi
// idénticos multiplicaría el lugar donde equivocarse con algo sensible.
//
// El mensaje de error **es el que devuelve la API, tal cual**. La API está
// hecha para no revelar si un email existe; si acá se lo tradujera a algo más
// "útil" —«esa cuenta no existe»— se perdería esa protección justo en la última
// milla.
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';

import { Boton } from '@manly/interfaz';

import { usarIngreso } from '@/caracteristicas/autenticacion/usar-sesion';
import { ErrorApi } from '@/servicios/api';
import { aceptarInvitacion, confirmarRecuperacion, pedirRecuperacion } from '@/servicios/panel';
import { Aviso, Campo, Entrada, Tarjeta } from './primitivos';

function mensajeDe(error: unknown): string {
  return error instanceof ErrorApi
    ? [error.message, ...error.detalles.map((detalle) => detalle.motivo)].join(' ')
    : 'Algo salió mal. Probá de nuevo.';
}

function Encabezado({ titulo, bajada }: { titulo: string; bajada: string }) {
  return (
    <header className="mb-6">
      <p className="versales text-nota tracking-versales text-grafito">Manly</p>
      <h1 className="font-titulo text-subtitulo tracking-titulo mt-1">{titulo}</h1>
      <p className="text-menor text-grafito mt-2">{bajada}</p>
    </header>
  );
}

export function FormularioIngreso() {
  const [email, setEmail] = useState('');
  const [contrasenia, setContrasenia] = useState('');
  const ingreso = usarIngreso();
  const router = useRouter();

  function enviar(evento: FormEvent) {
    evento.preventDefault();

    ingreso.mutate({ email, contrasenia }, { onSuccess: () => router.replace('/panel') });
  }

  return (
    <Tarjeta>
      <Encabezado titulo="Entrar al panel" bajada="Con la cuenta que te dieron en el local." />

      <form onSubmit={enviar} className="space-y-4">
        <Campo etiqueta="Correo">
          <Entrada
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(evento) => setEmail(evento.target.value)}
          />
        </Campo>

        <Campo etiqueta="Contraseña">
          <Entrada
            type="password"
            name="contrasenia"
            autoComplete="current-password"
            required
            value={contrasenia}
            onChange={(evento) => setContrasenia(evento.target.value)}
          />
        </Campo>

        {ingreso.isError && <Aviso tono="error">{mensajeDe(ingreso.error)}</Aviso>}

        <Boton type="submit" className="w-full" disabled={ingreso.isPending}>
          {ingreso.isPending ? 'Entrando…' : 'Entrar'}
        </Boton>
      </form>

      <p className="text-nota text-grafito mt-4 text-center">
        <Link href="/panel/recuperar" className="underline underline-offset-4">
          Olvidé mi contraseña
        </Link>
      </p>
    </Tarjeta>
  );
}

/**
 * Define la contraseña, para una invitación o para una recuperación.
 *
 * Es el mismo formulario en los dos casos: sólo cambia a qué endpoint va y qué
 * dice el encabezado. La confirmación de la contraseña se compara acá porque un
 * error de tipeo en un campo que no se ve deja a la persona afuera de una cuenta
 * que acaba de crear.
 */
export function FormularioContrasenia({
  token,
  modo,
}: {
  token: string;
  modo: 'invitacion' | 'recuperacion';
}) {
  const [contrasenia, setContrasenia] = useState('');
  const [repetida, setRepetida] = useState('');
  const router = useRouter();

  const guardar = useMutation({
    mutationFn: (datos: { token: string; contrasenia: string }) =>
      modo === 'invitacion' ? aceptarInvitacion(datos) : confirmarRecuperacion(datos),
    onSuccess: () => router.replace('/panel'),
  });

  const noCoinciden = repetida.length > 0 && contrasenia !== repetida;

  function enviar(evento: FormEvent) {
    evento.preventDefault();

    if (noCoinciden) return;

    guardar.mutate({ token, contrasenia });
  }

  return (
    <Tarjeta>
      <Encabezado
        titulo={modo === 'invitacion' ? 'Creá tu contraseña' : 'Nueva contraseña'}
        bajada={
          modo === 'invitacion'
            ? 'Elegí una y ya quedás adentro.'
            : 'Al cambiarla se cierran tus otras sesiones.'
        }
      />

      <form onSubmit={enviar} className="space-y-4">
        <Campo etiqueta="Contraseña" ayuda="Al menos 10 caracteres. Una frase que recuerdes sirve.">
          <Entrada
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            value={contrasenia}
            onChange={(evento) => setContrasenia(evento.target.value)}
          />
        </Campo>

        <Campo etiqueta="Repetila" error={noCoinciden ? 'Las dos no coinciden.' : undefined}>
          <Entrada
            type="password"
            autoComplete="new-password"
            required
            value={repetida}
            onChange={(evento) => setRepetida(evento.target.value)}
          />
        </Campo>

        {guardar.isError && <Aviso tono="error">{mensajeDe(guardar.error)}</Aviso>}

        <Boton type="submit" className="w-full" disabled={guardar.isPending || noCoinciden}>
          {guardar.isPending ? 'Guardando…' : 'Guardar y entrar'}
        </Boton>
      </form>
    </Tarjeta>
  );
}

/**
 * Pide el enlace de recuperación.
 *
 * La respuesta es la misma exista o no la cuenta, y el texto que se muestra
 * también. Si dijera «no encontramos esa dirección», este formulario serviría
 * para averiguar quién tiene acceso al panel.
 */
export function FormularioRecuperacion() {
  const [email, setEmail] = useState('');

  const pedido = useMutation({ mutationFn: pedirRecuperacion });

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    pedido.mutate(email);
  }

  return (
    <Tarjeta>
      <Encabezado
        titulo="Recuperar el acceso"
        bajada="Te mandamos un enlace para poner una contraseña nueva."
      />

      {pedido.isSuccess ? (
        <Aviso tono="exito">{pedido.data.mensaje}</Aviso>
      ) : (
        <form onSubmit={enviar} className="space-y-4">
          <Campo etiqueta="Correo">
            <Entrada
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
            />
          </Campo>

          {pedido.isError && <Aviso tono="error">{mensajeDe(pedido.error)}</Aviso>}

          <Boton type="submit" className="w-full" disabled={pedido.isPending}>
            {pedido.isPending ? 'Enviando…' : 'Mandame el enlace'}
          </Boton>
        </form>
      )}

      <p className="text-nota text-grafito mt-4 text-center">
        <Link href="/panel/ingresar" className="underline underline-offset-4">
          Volver
        </Link>
      </p>
    </Tarjeta>
  );
}
