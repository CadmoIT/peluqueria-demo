// Estado del sistema, para mirar antes y después de un despliegue.
//
// Junta en un lugar las tres preguntas que en producción se responden tarde:
//
//   1. **¿Estamos cobrando de verdad?** Sin `MP_ACCESS_TOKEN` la pasarela es la
//      simulada, que aprueba todo. El arranque ya lo impide en producción, pero
//      en staging es lo normal y hay que poder verlo.
//   2. **¿Están saliendo los avisos?** El worker corre en otro servicio. Si se
//      cayó, nada falla: las notificaciones se acumulan en silencio.
//   3. **¿Se están liberando los horarios?** Una retención vencida que nadie
//      expira bloquea la agenda sin que aparezca en ningún lado.
//
// Cada señal viene con su lectura, no sólo con el número: un tablero que
// muestra `3` sin decir si tres está bien obliga a saberse el sistema de
// memoria.
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  latenciaBaseDatos,
  senalesDelSistema,
  ultimoLatido,
  type BaseDatos,
} from '@manly/base-datos';
import type { Diagnostico, SenalDiagnostico } from '@manly/contratos';

import { BASE_DATOS } from '../../comun/base-datos/base-datos.modulo';
import type { Entorno } from '../../configuracion/entorno';

/**
 * Cuánto puede tardar el worker en dar señales antes de preocuparse.
 *
 * El despachador corre cada cinco minutos. Quince es tres pasadas perdidas:
 * suficiente para descartar un reinicio y poco para enterarse el mismo día.
 */
const MINUTOS_SIN_LATIDO = 15;

/** Atraso tolerable de la bandeja de salida, en minutos. */
const MINUTOS_ATRASO_TOLERABLE = 15;

@Injectable()
export class DiagnosticoServicio {
  constructor(
    @Inject(BASE_DATOS) private readonly bd: BaseDatos,
    private readonly configuracion: ConfigService<Entorno, true>,
  ) {}

  async consultar(): Promise<Diagnostico> {
    const [senales, latido, latencia] = await Promise.all([
      senalesDelSistema(this.bd),
      ultimoLatido(this.bd),
      latenciaBaseDatos(this.bd),
    ]);

    const token = this.configuracion.get('MP_ACCESS_TOKEN', { infer: true });
    const enProduccion = this.configuracion.get('NODE_ENV', { infer: true }) === 'production';

    const minutosSinLatido =
      latido === null ? null : Math.floor((Date.now() - latido.ultimaCorrida.getTime()) / 60_000);

    const revisar: SenalDiagnostico[] = [];

    // ── Cobro ────────────────────────────────────────────────────────────────
    revisar.push(
      token
        ? {
            clave: 'pasarela',
            titulo: 'Cobro de señas',
            estado: token.startsWith('TEST-') ? 'atencion' : 'bien',
            detalle: token.startsWith('TEST-')
              ? 'Mercado Pago en modo prueba: no entra dinero real.'
              : 'Mercado Pago en producción.',
          }
        : {
            clave: 'pasarela',
            titulo: 'Cobro de señas',
            // En producción esto no puede pasar: el arranque lo impide. En
            // staging es lo esperado, y ahí es aviso y no falla.
            estado: enProduccion ? 'mal' : 'atencion',
            detalle: 'Pasarela SIMULADA: aprueba todo y no cobra nada.',
          },
    );

    // ── Worker ───────────────────────────────────────────────────────────────
    revisar.push(
      latido === null
        ? {
            clave: 'worker',
            titulo: 'Procesos de fondo',
            estado: 'mal',
            detalle: 'El worker nunca corrió en este entorno.',
          }
        : {
            clave: 'worker',
            titulo: 'Procesos de fondo',
            estado: (minutosSinLatido ?? 0) > MINUTOS_SIN_LATIDO ? 'mal' : 'bien',
            detalle:
              (minutosSinLatido ?? 0) > MINUTOS_SIN_LATIDO
                ? `Sin señales hace ${String(minutosSinLatido)} minutos. Corre cada cinco.`
                : `Última corrida hace ${String(minutosSinLatido)} minutos.`,
          },
    );

    // ── Canales de aviso ─────────────────────────────────────────────────────
    for (const [clave, titulo, modo] of [
      ['whatsapp', 'Avisos por WhatsApp', latido?.canalWhatsapp],
      ['email', 'Avisos por correo', latido?.canalEmail],
    ] as const) {
      revisar.push({
        clave,
        titulo,
        estado: modo === 'real' ? 'bien' : enProduccion ? 'mal' : 'atencion',
        detalle:
          modo === undefined
            ? 'Sin datos: el worker todavía no reportó.'
            : modo === 'real'
              ? 'Enviando de verdad.'
              : 'SIMULADO: los envíos se registran como exitosos y no sale nada.',
      });
    }

    // ── Bandeja de salida ────────────────────────────────────────────────────
    const atraso = senales.atrasoDespachoMinutos;

    revisar.push({
      clave: 'bandeja',
      titulo: 'Avisos por salir',
      estado: atraso !== null && atraso > MINUTOS_ATRASO_TOLERABLE ? 'mal' : 'bien',
      detalle:
        senales.notificacionesVencidas === 0
          ? 'Nada pendiente.'
          : `${String(senales.notificacionesVencidas)} esperando, el más viejo hace ${String(atraso)} minutos.`,
    });

    revisar.push({
      clave: 'fallidas',
      titulo: 'Avisos que no llegaron',
      estado: senales.notificacionesFallidas > 0 ? 'atencion' : 'bien',
      detalle:
        senales.notificacionesFallidas > 0
          ? `${String(senales.notificacionesFallidas)} sin entregar. Hay que llamar a esas personas.`
          : 'Todo lo que se intentó, llegó.',
    });

    // ── Agenda ───────────────────────────────────────────────────────────────
    revisar.push({
      clave: 'retenciones',
      titulo: 'Horarios retenidos',
      estado: senales.retencionesSinExpirar > 0 ? 'atencion' : 'bien',
      detalle:
        senales.retencionesSinExpirar > 0
          ? `${String(senales.retencionesSinExpirar)} vencidas sin liberar. El expirador corre cada minuto.`
          : 'Sin retenciones vencidas.',
    });

    // ── Base de datos ────────────────────────────────────────────────────────
    revisar.push({
      clave: 'base',
      titulo: 'Base de datos',
      estado: latencia > 500 ? 'atencion' : 'bien',
      detalle: `Responde en ${String(latencia)} ms.`,
    });

    return {
      entorno: enProduccion ? 'produccion' : 'no-produccion',
      version: process.env.npm_package_version ?? '0.0.0',
      senales: revisar,
      resumen: {
        reservasProximas: senales.reservasProximas,
        pagosSinConciliar: senales.pagosSinConciliar,
        notificacionesRetenidas: senales.notificacionesRetenidas,
      },
      marcaTiempo: new Date().toISOString(),
    };
  }
}
