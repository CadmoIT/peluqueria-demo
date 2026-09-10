// Recorre el flujo completo contra un entorno que ya está desplegado.
//
// Es la lista de verificación de staging, pero ejecutable. Una lista en un
// documento se lee salteada y se marca de memoria; esto hace las llamadas de
// verdad, contra la API que se acaba de desplegar, y dice en qué paso se cayó.
//
//   pnpm --filter @manly/backend verificar
//   pnpm --filter @manly/backend verificar -- https://api.manly.com.ar/api/v1
//
// Lo que **no** hace: pagar. El checkout de Mercado Pago es una pantalla del
// proveedor y no se puede recorrer desde acá; el script llega hasta el enlace
// de pago y avisa que ese tramo se prueba a mano con una tarjeta de prueba.
//
// Deja todo como lo encontró: la reserva de prueba se cancela al final. Si el
// script se corta antes, queda una reserva a nombre de «Verificación
// automática» que hay que cancelar desde el panel.
import { randomUUID } from 'node:crypto';

const BASE = process.argv[2] ?? 'http://localhost:3001/api/v1';

/** Cada paso se anota con lo que se comprobó y por qué importa. */
interface Resultado {
  paso: string;
  ok: boolean;
  detalle: string;
}

const resultados: Resultado[] = [];

function anotar(paso: string, ok: boolean, detalle: string): void {
  resultados.push({ paso, ok, detalle });
  console.warn(`${ok ? '  ok  ' : ' FALLA'}  ${paso}${detalle ? ` — ${detalle}` : ''}`);
}

async function pedir<T>(
  ruta: string,
  opciones: RequestInit = {},
): Promise<{ estado: number; cuerpo: T }> {
  const respuesta = await fetch(`${BASE}${ruta}`, {
    ...opciones,
    headers: { 'Content-Type': 'application/json', ...opciones.headers },
  });

  const texto = await respuesta.text();

  return {
    estado: respuesta.status,
    cuerpo: (texto ? JSON.parse(texto) : null) as T,
  };
}

/** Un día hábil dentro del horizonte, a media mañana hora del local. */
function proximoDiaHabil(): { desde: string; hasta: string } {
  const fecha = new Date();

  fecha.setUTCDate(fecha.getUTCDate() + 3);
  fecha.setUTCHours(0, 0, 0, 0);

  const desde = new Date(fecha);
  const hasta = new Date(fecha.getTime() + 4 * 86_400_000);

  return { desde: desde.toISOString(), hasta: hasta.toISOString() };
}

interface Sucursal {
  id: string;
  nombre: string;
}
interface Servicio {
  id: string;
  nombre: string;
  duracionMinutos: number;
  seniaCentavos: number;
}
interface Bloque {
  servicioId: string;
  profesionalId: string;
  orden: number;
  comienzaEn: string;
  terminaEn: string;
}
interface Opcion {
  comienzaEn: string;
  seniaTotalCentavos: number;
  bloques: Bloque[];
}

async function verificar(): Promise<void> {
  console.warn(`\nVerificando ${BASE}\n`);

  // ── 1. El servicio responde y su base también ──────────────────────────────
  const salud = await pedir<{ estado: string; baseDatosMs: number }>('/salud');

  anotar(
    'La API responde y llega a la base',
    salud.estado === 200 && salud.cuerpo.estado === 'operativo',
    salud.estado === 200
      ? `base en ${String(salud.cuerpo.baseDatosMs)} ms`
      : `HTTP ${String(salud.estado)}`,
  );

  if (salud.estado !== 200) {
    return terminar();
  }

  // ── 2. El catálogo tiene datos ─────────────────────────────────────────────
  const sucursales = await pedir<Sucursal[]>('/sucursales');
  const sucursal = sucursales.cuerpo[0];

  anotar(
    'Hay sucursales publicadas',
    Boolean(sucursal),
    sucursal ? `${String(sucursales.cuerpo.length)}, primera: ${sucursal.nombre}` : 'ninguna',
  );

  if (!sucursal) return terminar();

  const servicios = await pedir<Servicio[]>(`/sucursales/${sucursal.id}/servicios`);

  // Se prefiere uno con seña: es el camino largo —retención, enlace de pago,
  // confirmación por webhook— y el que más tiene para romperse. Verificar con
  // un servicio sin seña deja sin probar justo la parte que mueve dinero.
  const servicio = servicios.cuerpo.find((uno) => uno.seniaCentavos > 0) ?? servicios.cuerpo[0];

  anotar(
    'La sucursal tiene servicios',
    Boolean(servicio),
    servicio
      ? `${String(servicios.cuerpo.length)}, se prueba con: ${servicio.nombre}` +
          (servicio.seniaCentavos > 0 ? ' (con seña)' : ' (sin seña)')
      : 'ninguno',
  );

  if (!servicio) return terminar();

  // ── 3. El sitio está tomando reservas ──────────────────────────────────────
  const publica = await pedir<{ reservasOnlineActivas: boolean }>('/configuracion-publica');

  anotar(
    'Las reservas online están abiertas',
    publica.cuerpo.reservasOnlineActivas,
    publica.cuerpo.reservasOnlineActivas ? '' : 'el interruptor está apagado',
  );

  if (!publica.cuerpo.reservasOnlineActivas) return terminar();

  // ── 4. El motor devuelve horarios ──────────────────────────────────────────
  const rango = proximoDiaHabil();
  const disponibilidad = await pedir<{ opciones: Opcion[] }>('/disponibilidad/buscar', {
    method: 'POST',
    body: JSON.stringify({
      sucursalId: sucursal.id,
      servicios: [{ servicioId: servicio.id }],
      ...rango,
    }),
  });

  const opcion = disponibilidad.cuerpo.opciones?.[0];

  anotar(
    'Hay horarios disponibles',
    Boolean(opcion),
    opcion
      ? `${String(disponibilidad.cuerpo.opciones.length)} opciones`
      : 'ninguna: revisá horarios y profesionales',
  );

  if (!opcion) return terminar();

  // ── 5. Retener bloquea el horario ──────────────────────────────────────────
  const retencion = await pedir<{ reservaId: string; token: string; seniaTotalCentavos: number }>(
    '/reservas/retener',
    {
      method: 'POST',
      body: JSON.stringify({ sucursalId: sucursal.id, bloques: opcion.bloques }),
    },
  );

  anotar(
    'Se retiene el horario elegido',
    retencion.estado === 201 || retencion.estado === 200,
    `HTTP ${String(retencion.estado)}`,
  );

  if (!retencion.cuerpo.token) return terminar();

  const { token } = retencion.cuerpo;

  // ── 6. El mismo horario ya no se puede tomar ───────────────────────────────
  const choque = await pedir('/reservas/retener', {
    method: 'POST',
    body: JSON.stringify({ sucursalId: sucursal.id, bloques: opcion.bloques }),
  });

  anotar(
    'El horario retenido queda bloqueado para otros',
    choque.estado === 409,
    `HTTP ${String(choque.estado)}, se esperaba 409`,
  );

  // ── 7. Completar la reserva con los datos del cliente ──────────────────────
  const confirmacion = await pedir<{ estado: string }>('/reservas', {
    method: 'POST',
    body: JSON.stringify({
      token,
      cliente: {
        nombre: 'Verificación automática',
        canalContacto: 'email',
        email: `verificacion+${randomUUID().slice(0, 8)}@manly.local`,
        aceptaCondiciones: true,
      },
    }),
  });

  anotar(
    'Se completa la reserva con los datos del cliente',
    confirmacion.estado === 200 || confirmacion.estado === 201,
    `HTTP ${String(confirmacion.estado)}, estado: ${confirmacion.cuerpo.estado ?? '—'}`,
  );

  // ── 8. El enlace de gestión funciona ───────────────────────────────────────
  const consulta = await pedir<{ estado: string }>(`/mi-reserva/${token}`);

  anotar(
    'El enlace de gestión abre la reserva',
    consulta.estado === 200,
    `HTTP ${String(consulta.estado)}`,
  );

  // ── 9. El cobro de la seña, hasta donde se puede sin pagar ─────────────────
  if (retencion.cuerpo.seniaTotalCentavos > 0) {
    const preferencia = await pedir<{ urlPago: string }>('/pagos/mercado-pago/preferencia', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });

    const esSimulada = preferencia.cuerpo.urlPago?.includes('/pagos/simulado');

    anotar(
      'Se crea el enlace de pago',
      preferencia.estado === 201 || preferencia.estado === 200,
      esSimulada
        ? 'PASARELA SIMULADA: no se cobra dinero real'
        : 'pasarela real, falta pagar a mano con tarjeta de prueba',
    );
  } else {
    anotar('Cobro de seña', true, 'el servicio no lleva seña, no hay nada que cobrar');
  }

  // ── 10. Cancelar, para no dejar basura en la agenda ────────────────────────
  const cancelacion = await pedir<{ resultado: string }>(`/mi-reserva/${token}/cancelar`, {
    method: 'POST',
    body: JSON.stringify({ motivo: 'Verificación automática del entorno' }),
  });

  anotar(
    'Se cancela la reserva de prueba',
    cancelacion.estado === 200,
    `HTTP ${String(cancelacion.estado)}, resultado: ${cancelacion.cuerpo.resultado ?? '—'}`,
  );

  // ── 11. El panel está cerrado ──────────────────────────────────────────────
  const panel = await pedir('/panel/agenda');

  anotar(
    'El panel exige sesión',
    panel.estado === 401,
    `HTTP ${String(panel.estado)}, se esperaba 401`,
  );

  terminar();
}

function terminar(): void {
  const fallas = resultados.filter((resultado) => !resultado.ok);

  console.warn(
    `\n${String(resultados.length - fallas.length)} de ${String(resultados.length)} pasos en verde.\n`,
  );

  if (fallas.length > 0) {
    console.error('Fallaron:');
    for (const falla of fallas) {
      console.error(`  - ${falla.paso}: ${falla.detalle}`);
    }
    process.exitCode = 1;
  }
}

verificar().catch((error: unknown) => {
  console.error('\nLa verificación se cortó:', error);
  process.exitCode = 1;
});
