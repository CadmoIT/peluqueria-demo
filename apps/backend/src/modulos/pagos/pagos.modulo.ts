// Agrupa el cobro de la seña y el procesamiento de las notificaciones.
//
// La pasarela se elige al arrancar según haya o no credenciales: con
// `MP_ACCESS_TOKEN` va la real, sin él la simulada. El arranque deja dicho en el
// registro cuál quedó activa, para que nadie descubra por accidente que estuvo
// cobrando contra un simulador.
import { Logger, Module, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Entorno } from '../../configuracion/entorno';
import { NotificacionesModulo } from '../notificaciones/notificaciones.modulo';
import { PagosControlador } from './pagos.controlador';
import { PagosServicio } from './pagos.servicio';
import { MercadoPagoPasarela } from './pasarela/mercado-pago.pasarela';
import { PASARELA, type Pasarela } from './pasarela/pasarela';
import { SimuladaPasarela } from './pasarela/simulada.pasarela';
import { SimuladoControlador } from './simulado.controlador';

const registro = new Logger('Pagos');

/** Si hay credenciales de Mercado Pago configuradas. */
function hayCredenciales(configuracion: ConfigService<Entorno, true>): boolean {
  return Boolean(configuracion.get('MP_ACCESS_TOKEN', { infer: true }));
}

const proveedorPasarela: Provider = {
  provide: PASARELA,
  inject: [ConfigService],
  useFactory: (configuracion: ConfigService<Entorno, true>): Pasarela => {
    const token = configuracion.get('MP_ACCESS_TOKEN', { infer: true });

    if (token) {
      // Los tokens de prueba de Mercado Pago empiezan con TEST-.
      const esSandbox = token.startsWith('TEST-');

      registro.warn(`Pasarela de pagos: Mercado Pago (${esSandbox ? 'sandbox' : 'PRODUCCIÓN'}).`);

      return new MercadoPagoPasarela(token, esSandbox);
    }

    registro.warn(
      'Pasarela de pagos: SIMULADA. No hay MP_ACCESS_TOKEN, así que no se cobra dinero real.',
    );

    return new SimuladaPasarela(configuracion.get('URL_PUBLICA_API', { infer: true }));
  },
};

/**
 * Da acceso a la simulada con su tipo concreto.
 *
 * El controlador del checkout falso necesita métodos que no están en la
 * interfaz. Devuelve null cuando la pasarela activa es la real.
 */
const proveedorSimulada: Provider = {
  provide: SimuladaPasarela,
  inject: [PASARELA, ConfigService],
  useFactory: (pasarela: Pasarela, configuracion: ConfigService<Entorno, true>) =>
    hayCredenciales(configuracion) ? null : (pasarela as SimuladaPasarela),
};

@Module({
  imports: [NotificacionesModulo],
  controllers: [PagosControlador, SimuladoControlador],
  providers: [PagosServicio, proveedorPasarela, proveedorSimulada],
  exports: [PagosServicio, PASARELA],
})
export class PagosModulo {}
