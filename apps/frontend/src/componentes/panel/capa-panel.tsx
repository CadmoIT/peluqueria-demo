'use client';

// Carcasa del panel: navegación, sesión y guardia de acceso.
//
// La guardia de acá es de comodidad, no de seguridad: evita mostrar pantallas
// vacías a quien no entró. **Lo que de verdad protege los datos es el guardián
// de la API**, que responde 401 sin importar lo que haga el navegador. Un panel
// que se defendiera sólo en el cliente se abriría con las herramientas de
// desarrollo.
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

import { cn } from '@manly/interfaz';

import { usarSalida, usarSesion } from '@/caracteristicas/autenticacion/usar-sesion';
import { contarSolicitudesPendientes } from '@/servicios/panel';
import { Cargando } from './primitivos';

interface Enlace {
  href: string;
  etiqueta: string;
  /** Sólo gerencia. Un profesional no administra el catálogo ni los accesos. */
  soloGerencia?: boolean;
}

const ENLACES: Enlace[] = [
  { href: '/panel', etiqueta: 'Agenda' },
  { href: '/panel/solicitudes', etiqueta: 'Solicitudes', soloGerencia: true },
  { href: '/panel/catalogo', etiqueta: 'Catálogo', soloGerencia: true },
  // Horarios lo ve todo el mundo: cada profesional carga la semana que va a
  // trabajar. La pantalla se recorta sola según el rol.
  { href: '/panel/horarios', etiqueta: 'Horarios' },
  { href: '/panel/usuarios', etiqueta: 'Accesos', soloGerencia: true },
  { href: '/panel/fallas', etiqueta: 'Avisos', soloGerencia: true },
  { href: '/panel/auditoria', etiqueta: 'Historial', soloGerencia: true },
  { href: '/panel/estado', etiqueta: 'Estado', soloGerencia: true },
  { href: '/panel/configuracion', etiqueta: 'Ajustes', soloGerencia: true },
];

export function CapaPanel({ children }: { children: ReactNode }) {
  const { usuario, cargando, sinConexion } = usarSesion();
  const router = useRouter();
  const ruta = usePathname();

  useEffect(() => {
    if (!cargando && !usuario && !sinConexion) {
      router.replace('/panel/ingresar');
    }
  }, [cargando, usuario, sinConexion, router]);

  if (cargando) return <Cargando />;

  if (sinConexion) {
    return (
      <p className="text-menor text-error p-8 text-center">
        No pudimos conectarnos con el sistema. Revisá la conexión y recargá.
      </p>
    );
  }

  // Mientras el redireccionamiento ocurre no se dibuja nada: mostrar la
  // estructura del panel a quien no entró sólo confunde.
  if (!usuario) return null;

  const enlaces = ENLACES.filter((enlace) => !enlace.soloGerencia || usuario.rol === 'gerencia');

  return (
    <div className="bg-lino min-h-screen">
      <header className="border-borde bg-papel border-b">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <Link href="/panel" className="versales text-menor tracking-versales py-1">
            Manly · Panel
          </Link>

          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-label="Secciones">
            {enlaces.map((enlace) => (
              <EnlaceNav
                key={enlace.href}
                enlace={enlace}
                activo={
                  enlace.href === '/panel'
                    ? ruta === '/panel'
                    : (ruta?.startsWith(enlace.href) ?? false)
                }
                mostrarPendientes={enlace.href === '/panel/solicitudes'}
              />
            ))}
          </nav>

          <div className="text-nota text-grafito ml-auto flex items-center gap-3">
            <span>
              {usuario.nombre}
              {usuario.rol === 'profesional' && ' · profesional'}
            </span>
            <BotonSalir />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}

function EnlaceNav({
  enlace,
  activo,
  mostrarPendientes,
}: {
  enlace: Enlace;
  activo: boolean;
  mostrarPendientes: boolean;
}) {
  return (
    <Link
      href={enlace.href}
      aria-current={activo ? 'page' : undefined}
      className={cn(
        // `py-1` no es decoracion: sin el, el enlace mide 22 px de alto y queda
        // por debajo del minimo de 24 px de WCAG 2.2. Es el menu que el equipo
        // usa desde el telefono, en el mostrador y apurado.
        'text-menor duration-(--duracion-rapida) py-1 transition-colors',
        activo ? 'text-tinta underline underline-offset-4' : 'text-grafito hover:text-tinta',
      )}
    >
      {enlace.etiqueta}
      {mostrarPendientes && <ContadorPendientes />}
    </Link>
  );
}

/**
 * Cuántas solicitudes esperan.
 *
 * Se refresca solo cada minuto: una solicitud sin resolver corre contra la
 * fecha del turno, y enterarse cuando alguien decide entrar a la pantalla puede
 * ser tarde.
 */
function ContadorPendientes() {
  const { data } = useQuery({
    queryKey: ['panel', 'solicitudes', 'pendientes'],
    queryFn: contarSolicitudesPendientes,
    refetchInterval: 60_000,
  });

  if (!data || data.total === 0) return null;

  return (
    <span className="rounded-manly bg-atencion text-nota text-lino ml-1 px-1.5 py-0.5">
      {data.total}
    </span>
  );
}

function BotonSalir() {
  const salida = usarSalida();
  const router = useRouter();

  return (
    <button
      type="button"
      // Igual que los enlaces del menu: sin relleno el boton mide 25x19 y no
      // llega al minimo de 24x24. Es el unico modo de cerrar sesion.
      className="hover:text-tinta -mx-1.5 px-1.5 py-1 underline underline-offset-4"
      onClick={() => {
        salida.mutate(undefined, { onSuccess: () => router.replace('/panel/ingresar') });
      }}
      disabled={salida.isPending}
    >
      Salir
    </button>
  );
}
