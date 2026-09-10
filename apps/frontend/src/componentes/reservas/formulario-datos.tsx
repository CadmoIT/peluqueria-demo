'use client';

// Datos del cliente y confirmación.
//
// El horario se retiene recién al enviar este formulario: hacerlo antes
// bloquearía turnos por cada persona que apenas está mirando.
import { zodResolver } from '@hookform/resolvers/zod';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';

import { cn } from '@manly/interfaz';
import {
  esquemaDatosCliente,
  type DatosCliente,
  type OpcionDisponibilidad,
  type Retencion,
} from '@manly/contratos';

import { ErrorApi } from '@/servicios/api';
import { confirmarReserva, crearPreferenciaPago } from '@/servicios/reservas';

interface Propiedades {
  opcion: OpcionDisponibilidad;
  retener: () => Promise<Retencion>;
  onListo: (token: string) => void;
}

export function FormularioDatos({ opcion, retener, onListo }: Propiedades) {
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const formulario = useForm<DatosCliente>({
    resolver: zodResolver(esquemaDatosCliente),
    defaultValues: { canalContacto: 'whatsapp' },
  });

  const canal = formulario.watch('canalContacto');

  async function enviar(datos: DatosCliente): Promise<void> {
    setErrorGeneral(null);
    setEnviando(true);

    try {
      // Dos pasos: primero se toma el horario, después se completan los datos.
      const retencion = await retener();

      await confirmarReserva({ token: retencion.token, cliente: datos });

      // Con seña, el turno todavía no está confirmado: hay que pagarla. Se sale
      // del sitio hacia el checkout de la pasarela, que es quien maneja los
      // datos de la tarjeta.
      if (opcion.seniaTotalCentavos > 0) {
        const preferencia = await crearPreferenciaPago(retencion.token);

        // Se guarda el token antes de irse, para poder volver a la reserva
        // aunque la pasarela pierda la URL de retorno.
        try {
          window.sessionStorage.setItem('manly.ultima-reserva', retencion.token);
        } catch {
          // Navegación privada o almacenamiento bloqueado: no es crítico.
        }

        window.location.assign(preferencia.urlPago);
        return;
      }

      onListo(retencion.token);
    } catch (error: unknown) {
      setErrorGeneral(
        error instanceof ErrorApi
          ? error.message
          : 'No pudimos completar la reserva. Probá de nuevo.',
      );
      setEnviando(false);
    }
  }

  return (
    <form
      onSubmit={(evento) => {
        void formulario.handleSubmit(enviar)(evento);
      }}
      className="mt-6 flex flex-col gap-5"
      noValidate
    >
      <Campo etiqueta="Nombre" error={formulario.formState.errors.nombre?.message}>
        <input
          type="text"
          autoComplete="name"
          {...formulario.register('nombre')}
          className="border-borde rounded-manly bg-papel min-h-11 w-full border px-3"
        />
      </Campo>

      <fieldset>
        <legend className="text-menor mb-2">¿Por dónde te avisamos?</legend>

        <div className="flex gap-2">
          {(['whatsapp', 'email'] as const).map((opcionCanal) => (
            <label
              key={opcionCanal}
              className={cn(
                'rounded-manly text-menor min-h-11 cursor-pointer border px-4',
                'duration-(--duracion-rapida) inline-flex items-center transition-colors',
                canal === opcionCanal
                  ? 'border-tinta bg-tinta text-lino'
                  : 'border-borde bg-papel hover:border-tinta',
              )}
            >
              <input
                type="radio"
                value={opcionCanal}
                {...formulario.register('canalContacto')}
                className="sr-only"
              />
              {opcionCanal === 'whatsapp' ? 'WhatsApp' : 'Email'}
            </label>
          ))}
        </div>
      </fieldset>

      {canal === 'whatsapp' ? (
        <Campo
          etiqueta="WhatsApp"
          ayuda="Con código de país y sin espacios. Por ejemplo 5491133334444."
          error={
            formulario.formState.errors.whatsapp?.message ??
            formulario.formState.errors.canalContacto?.message
          }
        >
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            {...formulario.register('whatsapp')}
            className="border-borde rounded-manly bg-papel min-h-11 w-full border px-3"
          />
        </Campo>
      ) : (
        <Campo
          etiqueta="Email"
          error={
            formulario.formState.errors.email?.message ??
            formulario.formState.errors.canalContacto?.message
          }
        >
          <input
            type="email"
            autoComplete="email"
            {...formulario.register('email')}
            className="border-borde rounded-manly bg-papel min-h-11 w-full border px-3"
          />
        </Campo>
      )}

      {/*
        Respaldo opcional. Si el canal elegido falla de forma definitiva —un
        número que no existe, un correo que rebota— el aviso se intenta por acá
        antes de darlo por perdido. Sin este dato, esa reserva queda
        incomunicada y hay que llamar por teléfono.
      */}
      {canal === 'whatsapp' ? (
        <Campo
          etiqueta="Email (opcional)"
          ayuda="Por si no podemos avisarte por WhatsApp."
          error={formulario.formState.errors.email?.message}
        >
          <input
            type="email"
            autoComplete="email"
            {...formulario.register('email')}
            className="border-borde rounded-manly bg-papel min-h-11 w-full border px-3"
          />
        </Campo>
      ) : (
        <Campo
          etiqueta="WhatsApp (opcional)"
          ayuda="Por si el correo no llega. Con código de país y sin espacios."
          error={formulario.formState.errors.whatsapp?.message}
        >
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            {...formulario.register('whatsapp')}
            className="border-borde rounded-manly bg-papel min-h-11 w-full border px-3"
          />
        </Campo>
      )}

      <label className="text-menor flex items-start gap-3">
        <input
          type="checkbox"
          {...formulario.register('aceptaCondiciones')}
          className="mt-1 size-4 shrink-0"
        />
        <span>
          Acepto las condiciones del turno y que me avisen por{' '}
          {canal === 'whatsapp' ? 'WhatsApp' : 'email'} sobre esta reserva.
        </span>
      </label>

      {formulario.formState.errors.aceptaCondiciones ? (
        <p role="alert" className="text-nota text-error">
          {formulario.formState.errors.aceptaCondiciones.message}
        </p>
      ) : null}

      {errorGeneral ? (
        <p role="alert" className="text-menor text-error">
          {errorGeneral}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={enviando}
        className={cn(
          'versales bg-tinta text-lino rounded-manly text-menor min-h-11 px-8 py-4',
          'duration-(--duracion-rapida) hover:bg-carbon transition-colors',
          'disabled:pointer-events-none disabled:opacity-45',
        )}
      >
        {enviando
          ? 'Confirmando…'
          : opcion.seniaTotalCentavos > 0
            ? 'Continuar al pago'
            : 'Confirmar turno'}
      </button>
    </form>
  );
}

function Campo({
  etiqueta,
  ayuda,
  error,
  children,
}: {
  etiqueta: string;
  ayuda?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-menor">{etiqueta}</span>
      {children}
      {ayuda ? <span className="text-nota text-grafito">{ayuda}</span> : null}
      {error ? (
        <span role="alert" className="text-nota text-error">
          {error}
        </span>
      ) : null}
    </label>
  );
}
