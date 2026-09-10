// Primitivos del panel.
//
// El sitio público y el panel comparten los tokens de la marca pero no los
// componentes: el público está hecho para convencer y el panel para trabajar
// rápido. Acá la densidad es alta, los campos son chicos y no hay aire de más.
//
// Viven en el frontend y no en @manly/interfaz porque son de esta aplicación:
// la biblioteca compartida guarda lo que define la marca, no la herramienta
// interna.
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

import { cn } from '@manly/interfaz';

export function Tarjeta({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-tarjeta border-borde bg-papel border p-4', className)}>
      {children}
    </div>
  );
}

export function TituloPanel({ children, accion }: { children: ReactNode; accion?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-titulo text-subtitulo tracking-titulo">{children}</h1>
      {accion}
    </div>
  );
}

/**
 * Etiqueta y campo, siempre juntos.
 *
 * La etiqueta envuelve al control en vez de apuntarle con `htmlFor`: así no hay
 * forma de que queden desapareados, que es el error más común y el que deja el
 * formulario inservible con lector de pantalla.
 */
export function Campo({
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
    <label className="block">
      <span className="versales text-nota text-grafito block">{etiqueta}</span>
      {children}
      {ayuda !== undefined && !error && (
        <span className="text-nota text-humo mt-1 block">{ayuda}</span>
      )}
      {error !== undefined && (
        <span className="text-nota text-error mt-1 block" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

const CLASES_CONTROL =
  'mt-1 w-full rounded-manly border border-borde bg-papel px-3 py-2 text-menor ' +
  'outline-none transition-colors duration-(--duracion-rapida) ' +
  'focus:border-tinta disabled:opacity-50';

export function Entrada({ className, ...resto }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CLASES_CONTROL, className)} {...resto} />;
}

export function Seleccion({
  className,
  children,
  ...resto
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(CLASES_CONTROL, className)} {...resto}>
      {children}
    </select>
  );
}

/** Aviso de resultado. `tono` decide el color, nunca el texto. */
export function Aviso({
  tono = 'neutro',
  children,
}: {
  tono?: 'neutro' | 'exito' | 'error' | 'atencion';
  children: ReactNode;
}) {
  const tonos = {
    neutro: 'border-borde bg-niebla text-grafito',
    exito: 'border-exito/40 bg-exito/10 text-exito',
    error: 'border-error/40 bg-error/10 text-error',
    atencion: 'border-atencion/40 bg-atencion/10 text-atencion',
  } as const;

  return (
    <p
      className={cn('rounded-manly text-menor border px-3 py-2', tonos[tono])}
      role={tono === 'error' ? 'alert' : 'status'}
    >
      {children}
    </p>
  );
}

/**
 * Estado de una reserva o de una solicitud, como etiqueta.
 *
 * Los estados que piden acción se ven distintos de los que ya se cerraron: en
 * una agenda llena, el color es lo primero que se lee.
 */
export function Estado({ valor }: { valor: string }) {
  const tonos: Record<string, string> = {
    confirmada: 'border-exito/40 text-exito',
    completada: 'border-borde text-humo',
    pendiente_pago: 'border-atencion/40 text-atencion',
    pendiente: 'border-atencion/40 text-atencion',
    cancelada: 'border-error/40 text-error',
    ausente: 'border-error/40 text-error',
    expirada: 'border-borde text-humo',
    aprobada: 'border-exito/40 text-exito',
    rechazada: 'border-error/40 text-error',
  };

  return (
    <span
      className={cn(
        'versales rounded-manly text-nota inline-block border px-2 py-0.5',
        tonos[valor] ?? 'border-borde text-grafito',
      )}
    >
      {valor.replace('_', ' ')}
    </span>
  );
}

/** Lo que se muestra mientras no hay nada que mostrar. */
export function Vacio({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-tarjeta border-borde text-menor text-humo border border-dashed px-4 py-10 text-center">
      {children}
    </p>
  );
}

export function Cargando() {
  return <p className="text-menor text-humo py-10 text-center">Cargando…</p>;
}
