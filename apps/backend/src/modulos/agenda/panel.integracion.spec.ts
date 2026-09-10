// Pruebas del panel contra PostgreSQL real.
//
// El panel es la cara interna del sistema: desde acá se ve la agenda de todos,
// los datos de los clientes y el dinero. Las pruebas apuntan a lo que puede
// salir caro —que un rol vea de más, que un turno se pise, que una solicitud se
// resuelva dos veces— antes que al camino feliz.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  asegurarConfiguracion,
  buscarReservaPorId,
  cargarDemostracion,
  CARPETA_MIGRACIONES,
  crearSolicitudCambio,
  crearUsuarioInvitado,
  listarSolicitudes,
  vincularProfesionalConUsuario,
  SEPARADOR_SENTENCIAS,
  type BaseDatos,
} from '@manly/base-datos';
import type { UsuarioSesion } from '@manly/contratos';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AdministracionServicio } from '../administracion/administracion.servicio';
import { AuditoriaServicio } from '../auditoria/auditoria.servicio';
import { NotificacionesServicio } from '../notificaciones/notificaciones.servicio';
import { ReservasServicio } from '../reservas/reservas.servicio';
import { SolicitudesServicio } from '../solicitudes/solicitudes.servicio';
import { AgendaServicio } from './agenda.servicio';
import { ReservasPanelServicio } from './reservas-panel.servicio';

function configuracionFalsa() {
  const valores: Record<string, string> = {
    NEXT_PUBLIC_URL_PUBLICA: 'http://localhost:3000',
    NODE_ENV: 'test',
  };

  return { get: (clave: string) => valores[clave] };
}

interface Contexto {
  cerrar: () => Promise<void>;
  bd: BaseDatos;
  agenda: AgendaServicio;
  reservas: ReservasServicio;
  panel: ReservasPanelServicio;
  solicitudes: SolicitudesServicio;
  administracion: AdministracionServicio;
  auditoria: AuditoriaServicio;
  sucursalId: string;
  servicioId: string;
  profesionalIds: string[];
  gerencia: UsuarioSesion;
  profesional: UsuarioSesion;
}

async function montar(): Promise<Contexto> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { btree_gist } = await import('@electric-sql/pglite/contrib/btree_gist');

  const cliente = new PGlite({ extensions: { btree_gist } });

  for (const archivo of readdirSync(CARPETA_MIGRACIONES)
    .filter((nombre) => nombre.endsWith('.sql'))
    .sort()) {
    for (const sentencia of readFileSync(join(CARPETA_MIGRACIONES, archivo), 'utf8')
      .split(SEPARADOR_SENTENCIAS)
      .map((trozo) => trozo.trim())
      .filter(Boolean)) {
      await cliente.exec(sentencia);
    }
  }

  const bd = drizzle(cliente as never) as unknown as BaseDatos;

  await asegurarConfiguracion(bd);
  await cargarDemostracion(bd);

  const notificaciones = new NotificacionesServicio(bd, configuracionFalsa() as never);
  const reservas = new ReservasServicio(bd, notificaciones);
  const administracion = new AdministracionServicio(bd);

  const sucursales = await administracion.listarSucursales();
  const servicios = await administracion.listarServicios();
  const profesionales = await administracion.listarProfesionales();

  // Los usuarios existen de verdad: `reservas.creada_por_usuario_id` tiene
  // clave foránea, así que un identificador inventado rebota en la base.
  const gerenciaId = await crearUsuarioInvitado(bd, {
    email: 'gerencia@manly.ar',
    nombre: 'Gerencia',
    rol: 'gerencia',
    hashToken: 'gerencia',
    expiraEn: new Date(Date.now() + 86_400_000),
  });

  const profesionalUsuarioId = await crearUsuarioInvitado(bd, {
    email: 'pro@manly.ar',
    nombre: 'Profesional',
    rol: 'profesional',
    hashToken: 'profesional',
    expiraEn: new Date(Date.now() + 86_400_000),
  });

  await vincularProfesionalConUsuario(bd, profesionales[0]!.id, profesionalUsuarioId);

  return {
    cerrar: () => cliente.close(),
    bd,
    agenda: new AgendaServicio(bd),
    reservas,
    panel: new ReservasPanelServicio(bd, reservas, notificaciones),
    solicitudes: new SolicitudesServicio(bd, reservas, notificaciones),
    administracion,
    auditoria: new AuditoriaServicio(bd),
    sucursalId: sucursales[0]!.id,
    servicioId: servicios.find((servicio) => servicio.nombre === 'Corte')!.id,
    profesionalIds: profesionales.map((profesional) => profesional.id),
    gerencia: {
      id: gerenciaId,
      nombre: 'Gerencia',
      email: 'gerencia@manly.ar',
      rol: 'gerencia',
      profesionalId: null,
    },
    profesional: {
      id: profesionalUsuarioId,
      nombre: 'Profesional',
      email: 'pro@manly.ar',
      rol: 'profesional',
      profesionalId: profesionales[0]!.id,
    },
  };
}

let contexto: Contexto;

beforeEach(async () => {
  contexto = await montar();
});

afterEach(async () => {
  await contexto.cerrar();
});

/**
 * Un horario dentro de la agenda de la demostración.
 *
 * Las semillas cargan lunes a sábado de 10 a 20 en hora de Buenos Aires, que es
 * UTC-3 todo el año. Las 14:00 UTC caen a las 11:00 del local, y se descartan
 * los domingos porque ese día no se atiende.
 */
function horarioHabil(diasAdelante = 7): Date {
  const fecha = new Date();

  fecha.setUTCDate(fecha.getUTCDate() + diasAdelante);
  fecha.setUTCHours(14, 0, 0, 0);

  while (fecha.getUTCDay() === 0) {
    fecha.setUTCDate(fecha.getUTCDate() + 1);
  }

  return fecha;
}

function bloqueEn(contexto: Contexto, comienza: Date, profesionalIndice = 0) {
  return {
    servicioId: contexto.servicioId,
    profesionalId: contexto.profesionalIds[profesionalIndice]!,
    orden: 0,
    comienzaEn: comienza.toISOString(),
    // Corte dura 45 minutos según las semillas.
    terminaEn: new Date(comienza.getTime() + 45 * 60_000).toISOString(),
  };
}

/** Carga un turno a mano, que es la vía del panel. */
async function reservarAMano(
  contexto: Contexto,
  comienza: Date,
  opciones: { profesionalIndice?: number; nombre?: string; whatsapp?: string | null } = {},
) {
  return contexto.panel.crearManual(
    {
      sucursalId: contexto.sucursalId,
      bloques: [bloqueEn(contexto, comienza, opciones.profesionalIndice ?? 0)],
      clienteNombre: opciones.nombre ?? 'Cliente de prueba',
      contactoWhatsapp: opciones.whatsapp === undefined ? '5491111111111' : opciones.whatsapp,
      contactoEmail: null,
      notas: null,
      avisar: false,
    },
    contexto.gerencia,
  );
}

describe('agenda', () => {
  it('muestra el turno cargado a mano con su ventana ocupada', async () => {
    const comienza = horarioHabil();

    await reservarAMano(contexto, comienza);

    const bloques = await contexto.agenda.consultar(
      {
        sucursalId: contexto.sucursalId,
        desde: new Date(comienza.getTime() - 3_600_000).toISOString(),
        hasta: new Date(comienza.getTime() + 3_600_000).toISOString(),
      },
      contexto.gerencia,
    );

    expect(bloques).toHaveLength(1);
    expect(bloques[0]?.clienteNombre).toBe('Cliente de prueba');
    expect(bloques[0]?.estado).toBe('confirmada');
    expect(bloques[0]?.contactoWhatsapp).toBe('5491111111111');
  });

  it('a un profesional le muestra sólo su agenda y sin datos de contacto', async () => {
    const comienza = horarioHabil();

    await reservarAMano(contexto, comienza, { profesionalIndice: 0, nombre: 'De la uno' });
    await reservarAMano(contexto, comienza, { profesionalIndice: 1, nombre: 'De la dos' });

    const bloques = await contexto.agenda.consultar(
      {
        sucursalId: contexto.sucursalId,
        desde: new Date(comienza.getTime() - 3_600_000).toISOString(),
        hasta: new Date(comienza.getTime() + 3_600_000).toISOString(),
        // Aunque pida ver la de otro, se le devuelve la suya.
        profesionalId: contexto.profesionalIds[1]!,
      },
      contexto.profesional,
    );

    expect(bloques).toHaveLength(1);
    expect(bloques[0]?.clienteNombre).toBe('De la uno');
    expect(bloques[0]?.contactoWhatsapp).toBeNull();
    expect(bloques[0]?.contactoEmail).toBeNull();
  });

  it('rechaza un rango más largo que un mes', async () => {
    await expect(
      contexto.agenda.consultar(
        {
          sucursalId: contexto.sucursalId,
          desde: new Date().toISOString(),
          hasta: new Date(Date.now() + 60 * 86_400_000).toISOString(),
        },
        contexto.gerencia,
      ),
    ).rejects.toThrow(/de a 31 días/);
  });

  it('no deja marcar asistencia sobre una reserva que no está confirmada', async () => {
    const { reservaId } = await reservarAMano(contexto, horarioHabil());

    expect(await contexto.agenda.marcarAsistencia(reservaId, 'completada')).toBe(true);
    // Ya no está confirmada: la segunda vez no hace nada.
    expect(await contexto.agenda.marcarAsistencia(reservaId, 'ausente')).toBe(false);
  });
});

describe('reserva manual', () => {
  it('no puede pisar un turno ya tomado', async () => {
    const comienza = horarioHabil();

    await reservarAMano(contexto, comienza);

    await expect(reservarAMano(contexto, comienza)).rejects.toThrow(/ya fue tomado/);
  });

  it('deja cargar un turno que ya empezó', async () => {
    // Alguien entró sin aviso y se lo anota después. Desde la web esto sería
    // siempre un error; desde el mostrador es lo normal.
    const comienza = horarioHabil(-7);

    const { reservaId } = await reservarAMano(contexto, comienza);

    expect(reservaId).toBeTruthy();
  });

  it('no acepta avisar sin ningún dato de contacto', async () => {
    await expect(
      contexto.panel.crearManual(
        {
          sucursalId: contexto.sucursalId,
          bloques: [bloqueEn(contexto, horarioHabil())],
          clienteNombre: 'Sin contacto',
          contactoWhatsapp: null,
          contactoEmail: null,
          notas: null,
          avisar: true,
        },
        contexto.gerencia,
      ),
    ).rejects.toThrow(/WhatsApp o un correo/);
  });

  it('acepta un turno sin ningún dato de contacto', async () => {
    // Lo detectó una prueba contra la API real: un turno de mostrador sin
    // teléfono ni correo rompía la restricción de contacto de la base y
    // devolvía 500.
    const { reservaId } = await reservarAMano(contexto, horarioHabil(), { whatsapp: null });
    const detalle = await contexto.panel.detalle(reservaId, contexto.gerencia);

    expect(detalle.estado).toBe('confirmada');
    expect(detalle.canalContacto).toBeNull();
  });

  it('no deja el horario bloqueado cuando la carga falla', async () => {
    // La retención ocupa el horario antes de completarse. Si algo falla en el
    // medio y la retención queda ahí, el turno se vuelve inreservable hasta que
    // expire, y con una reserva que nadie pidió.
    const comienza = horarioHabil();

    await expect(
      contexto.panel.crearManual(
        {
          sucursalId: contexto.sucursalId,
          bloques: [bloqueEn(contexto, comienza)],
          // PostgreSQL no acepta el byte cero dentro de un `text`, así que la
          // escritura falla después de que la retención ya tomó el horario.
          clienteNombre: 'Nombre roto',
          contactoWhatsapp: null,
          contactoEmail: null,
          notas: null,
          avisar: false,
        },
        contexto.gerencia,
      ),
    ).rejects.toThrow();

    // El horario tiene que haber quedado libre.
    const segunda = await reservarAMano(contexto, comienza);

    expect(segunda.reservaId).toBeTruthy();
  });

  it('nace confirmada y sin seña', async () => {
    const { reservaId } = await reservarAMano(contexto, horarioHabil());
    const detalle = await contexto.panel.detalle(reservaId, contexto.gerencia);

    expect(detalle.estado).toBe('confirmada');
    expect(detalle.seniaTotalCentavos).toBe(0);
    expect(detalle.precioTotalCentavos).toBeGreaterThan(0);
  });

  it('le esconde el dinero a quien no es gerencia', async () => {
    const { reservaId } = await reservarAMano(contexto, horarioHabil());

    const detalle = await contexto.panel.detalle(reservaId, contexto.profesional);

    expect(detalle.contactoWhatsapp).toBeNull();
    expect(detalle.cobradoCentavos).toBe(0);
    expect(detalle.pagos).toHaveLength(0);
  });
});

describe('bloqueos', () => {
  it('avisa qué turnos quedaron adentro, pero no los cancela', async () => {
    const comienza = horarioHabil();
    const { reservaId } = await reservarAMano(contexto, comienza);

    const creado = await contexto.agenda.crearBloqueo(
      {
        profesionalId: contexto.profesionalIds[0]!,
        sucursalId: contexto.sucursalId,
        tipo: 'bloqueo',
        comienzaEn: new Date(comienza.getTime() - 3_600_000).toISOString(),
        terminaEn: new Date(comienza.getTime() + 3_600_000).toISOString(),
        motivo: 'Turno médico',
      },
      contexto.gerencia,
    );

    expect(creado.reservasAfectadas).toHaveLength(1);
    expect(creado.reservasAfectadas[0]?.reservaId).toBe(reservaId);

    const reserva = await buscarReservaPorId(contexto.bd, reservaId);

    expect(reserva?.estado).toBe('confirmada');
  });

  it('no deja que un profesional bloquee la agenda de otro', async () => {
    const comienza = horarioHabil();

    await expect(
      contexto.agenda.crearBloqueo(
        {
          profesionalId: contexto.profesionalIds[1]!,
          sucursalId: contexto.sucursalId,
          tipo: 'bloqueo',
          comienzaEn: comienza.toISOString(),
          terminaEn: new Date(comienza.getTime() + 3_600_000).toISOString(),
          motivo: null,
        },
        contexto.profesional,
      ),
    ).rejects.toThrow(/tu propia agenda/i);
  });
});

describe('solicitudes', () => {
  it('aprobar una cancelación cancela el turno', async () => {
    const { reservaId } = await reservarAMano(contexto, horarioHabil());

    const solicitudId = await crearSolicitudCambio(contexto.bd, {
      reservaId,
      tipo: 'cancelacion',
      motivo: 'No puedo ir',
    });

    const resuelta = await contexto.solicitudes.resolver(
      solicitudId,
      { decision: 'aprobar', respuesta: null },
      contexto.gerencia,
    );

    expect(resuelta.resultado).toBe('aprobada');

    const reserva = await buscarReservaPorId(contexto.bd, reservaId);

    expect(reserva?.estado).toBe('cancelada');
  });

  it('rechazar deja el turno en pie', async () => {
    const { reservaId } = await reservarAMano(contexto, horarioHabil());

    const solicitudId = await crearSolicitudCambio(contexto.bd, {
      reservaId,
      tipo: 'cancelacion',
      motivo: null,
    });

    await contexto.solicitudes.resolver(
      solicitudId,
      { decision: 'rechazar', respuesta: 'Está dentro de las 24 horas.' },
      contexto.gerencia,
    );

    const reserva = await buscarReservaPorId(contexto.bd, reservaId);

    expect(reserva?.estado).toBe('confirmada');
  });

  it('no se puede resolver dos veces', async () => {
    const { reservaId } = await reservarAMano(contexto, horarioHabil());

    const solicitudId = await crearSolicitudCambio(contexto.bd, {
      reservaId,
      tipo: 'cancelacion',
      motivo: null,
    });

    await contexto.solicitudes.resolver(
      solicitudId,
      { decision: 'aprobar', respuesta: null },
      contexto.gerencia,
    );

    await expect(
      contexto.solicitudes.resolver(
        solicitudId,
        { decision: 'rechazar', respuesta: 'Me arrepentí.' },
        contexto.gerencia,
      ),
    ).rejects.toThrow(/ya fue resuelta/);
  });

  it('aprobar una reprogramación mueve el turno al horario propuesto', async () => {
    const comienza = horarioHabil();
    const nuevo = new Date(comienza.getTime() + 2 * 3_600_000);
    const { reservaId } = await reservarAMano(contexto, comienza);

    const solicitudId = await crearSolicitudCambio(contexto.bd, {
      reservaId,
      tipo: 'reprogramacion',
      motivo: null,
      propuesta: [bloqueEn(contexto, nuevo)],
    });

    await contexto.solicitudes.resolver(
      solicitudId,
      { decision: 'aprobar', respuesta: null },
      contexto.gerencia,
    );

    const reserva = await buscarReservaPorId(contexto.bd, reservaId);

    expect(reserva?.comienzaEn.toISOString()).toBe(nuevo.toISOString());
  });

  it('con una propuesta corrupta no cierra la solicitud', async () => {
    // Es lo que protege el orden de las operaciones: si se marcara resuelta
    // antes de aplicar el cambio, quedaría cerrada y el turno sin mover.
    const { reservaId } = await reservarAMano(contexto, horarioHabil());

    const solicitudId = await crearSolicitudCambio(contexto.bd, {
      reservaId,
      tipo: 'reprogramacion',
      motivo: null,
      propuesta: { esto: 'no es una lista de bloques' },
    });

    await expect(
      contexto.solicitudes.resolver(
        solicitudId,
        { decision: 'aprobar', respuesta: null },
        contexto.gerencia,
      ),
    ).rejects.toThrow(/horario nuevo válido/);

    const [solicitud] = await listarSolicitudes(contexto.bd, { estado: 'pendiente' });

    expect(solicitud?.id).toBe(solicitudId);
  });
});

describe('administración', () => {
  it('cambiar el precio de un servicio no altera las reservas ya tomadas', async () => {
    const { reservaId } = await reservarAMano(contexto, horarioHabil());
    const antes = await contexto.panel.detalle(reservaId, contexto.gerencia);

    await contexto.administracion.actualizarServicio(contexto.servicioId, {
      precioCentavos: 9_999_999,
    });

    const despues = await contexto.panel.detalle(reservaId, contexto.gerencia);

    expect(despues.precioTotalCentavos).toBe(antes.precioTotalCentavos);
  });

  it('reemplazar el horario semanal borra lo anterior', async () => {
    const profesionalId = contexto.profesionalIds[0]!;

    await contexto.administracion.guardarHorario({
      profesionalId,
      sucursalId: contexto.sucursalId,
      franjas: [{ diaSemana: 3, comienza: '09:00', termina: '13:00' }],
    });

    const horarios = await contexto.administracion.listarHorarios({
      profesionalId,
      sucursalId: contexto.sucursalId,
    });

    expect(horarios).toHaveLength(1);
    expect(horarios[0]?.diaSemana).toBe(3);
  });

  it('no acepta un segundo recordatorio más lejano que el primero', async () => {
    await expect(
      contexto.administracion.actualizarConfiguracion({
        horasRecordatorioPrimero: 4,
        horasRecordatorioSegundo: 24,
      }),
    ).rejects.toThrow(/más cerca del turno/);
  });

  it('da de baja sin borrar', async () => {
    const [sucursal] = await contexto.administracion.listarSucursales();

    await contexto.administracion.actualizarSucursal(sucursal!.id, { activa: false });

    const sucursales = await contexto.administracion.listarSucursales();

    expect(sucursales.find((una) => una.id === sucursal!.id)?.activa).toBe(false);
    expect(sucursales).toHaveLength(3);
  });
});

describe('auditoría', () => {
  it('guarda los valores de antes y de después', async () => {
    const usuarioId = await crearUsuarioInvitado(contexto.bd, {
      email: 'quien@manly.ar',
      nombre: 'Quien',
      rol: 'gerencia',
      hashToken: 'da-igual',
      expiraEn: new Date(Date.now() + 86_400_000),
    });

    await contexto.auditoria.registrar({
      usuario: { ...contexto.gerencia, id: usuarioId },
      accion: 'servicio.modificado',
      entidad: 'servicios',
      entidadId: contexto.servicioId,
      antes: { precioCentavos: 1_500_000 },
      despues: { precioCentavos: 1_800_000 },
    });

    const { entradas, total } = await contexto.auditoria.listar({ entidad: 'servicios' });

    expect(total).toBe(1);
    expect(entradas[0]?.usuarioNombre).toBe('Quien');
    expect(entradas[0]?.datosAntes).toEqual({ precioCentavos: 1_500_000 });
  });

  it('no voltea la operación auditada cuando falla', async () => {
    // La entidad no existe y el identificador no es un uuid: el INSERT falla.
    // Tiene que quedar en el log y seguir, no propagar el error.
    await expect(
      contexto.auditoria.registrar({
        usuario: contexto.gerencia,
        accion: 'algo',
        entidad: 'lo_que_sea',
        entidadId: 'esto-no-es-un-uuid',
      }),
    ).resolves.toBeUndefined();
  });
});
