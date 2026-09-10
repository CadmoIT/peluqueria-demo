'use client';

// Estado del sistema.
//
// Es la pantalla que se mira antes de anunciar que el sitio está andando, y la
// primera a la que hay que ir cuando alguien dice que no le llegó el
// recordatorio.
//
// Muestra señales con su lectura, no números sueltos: quien la abre un lunes a
// las nueve no tiene por qué saber cada cuánto corre el despachador para
// entender si «3 pendientes» está bien o mal.
import { useQuery } from '@tanstack/react-query';
import type { SenalDiagnostico } from '@manly/contratos';

import { cn } from '@manly/interfaz';

import { Aviso, Cargando, Tarjeta, TituloPanel } from '@/componentes/panel/primitivos';
import { obtenerDiagnostico } from '@/servicios/panel';

const TONOS = {
  bien: { punto: 'bg-exito', texto: 'Bien' },
  atencion: { punto: 'bg-atencion', texto: 'Atención' },
  mal: { punto: 'bg-error', texto: 'Mal' },
} as const;

export default function PaginaEstado() {
  const diagnostico = useQuery({
    queryKey: ['panel', 'diagnostico'],
    queryFn: obtenerDiagnostico,
    // Se refresca solo: esta pantalla se deja abierta mientras se despliega.
    refetchInterval: 30_000,
  });

  if (diagnostico.isPending) return <Cargando />;

  if (diagnostico.isError) {
    return (
      <>
        <TituloPanel>Estado</TituloPanel>
        <Aviso tono="error">No pudimos leer el estado del sistema.</Aviso>
      </>
    );
  }

  const datos = diagnostico.data;
  const problemas = datos.senales.filter((senal) => senal.estado === 'mal');

  return (
    <>
      <TituloPanel
        accion={
          <span className="text-nota text-grafito">
            {datos.entorno === 'produccion' ? 'Producción' : 'No es producción'} · v{datos.version}
          </span>
        }
      >
        Estado
      </TituloPanel>

      {problemas.length > 0 && (
        <div className="mb-6">
          <Aviso tono="error">
            {problemas.length === 1
              ? `Hay un problema: ${problemas[0]?.titulo.toLowerCase()}.`
              : `Hay ${String(problemas.length)} problemas. Están marcados abajo.`}
          </Aviso>
        </div>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {datos.senales.map((senal) => (
          <li key={senal.clave}>
            <FichaSenal senal={senal} />
          </li>
        ))}
      </ul>

      <Tarjeta className="mt-6">
        <h2 className="versales text-nota tracking-versales text-grafito mb-3">
          Cómo viene el día
        </h2>

        <dl className="text-menor grid gap-x-6 gap-y-2 sm:grid-cols-3">
          <Dato titulo="Turnos por venir">{datos.resumen.reservasProximas}</Dato>
          <Dato titulo="Esperando pago">{datos.resumen.pagosSinConciliar}</Dato>
          <Dato titulo="Avisos retenidos">{datos.resumen.notificacionesRetenidas}</Dato>
        </dl>
      </Tarjeta>

      <p className="text-nota text-humo mt-4">
        Se actualiza solo cada 30 segundos. Última lectura:{' '}
        {new Intl.DateTimeFormat('es-AR', {
          timeZone: 'America/Argentina/Buenos_Aires',
          timeStyle: 'medium',
          hourCycle: 'h23',
        }).format(new Date(datos.marcaTiempo))}
        .
      </p>
    </>
  );
}

function FichaSenal({ senal }: { senal: SenalDiagnostico }) {
  const tono = TONOS[senal.estado];

  return (
    <Tarjeta
      className={cn(
        'h-full',
        senal.estado === 'mal' && 'border-error/40',
        senal.estado === 'atencion' && 'border-atencion/40',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn('mt-1.5 size-2 shrink-0 rounded-full', tono.punto)}
          // El color no es la única señal: quien no distingue rojo de verde
          // necesita leerlo.
          aria-hidden
        />
        <div>
          <p className="text-menor">
            <strong>{senal.titulo}</strong>{' '}
            <span className="text-nota text-grafito">· {tono.texto}</span>
          </p>
          <p className="text-nota text-grafito mt-1">{senal.detalle}</p>
        </div>
      </div>
    </Tarjeta>
  );
}

function Dato({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="versales text-nota text-humo">{titulo}</dt>
      <dd className="text-subtitulo font-titulo">{children}</dd>
    </div>
  );
}
