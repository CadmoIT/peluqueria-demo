// Elige los canales según haya o no credenciales.
//
// Cada canal se decide por separado: se puede tener email real y WhatsApp
// simulado mientras se espera la aprobación de las plantillas de Meta, que
// puede demorar semanas.
import type { Entorno } from '../../configuracion/entorno';
import type { Canal } from './canal';
import { CanalEmail } from './email';
import { CanalSimulado } from './simulados';
import { CanalWhatsApp } from './whatsapp';

export interface Canales {
  whatsapp: Canal;
  email: Canal;
}

export function crearCanales(entorno: Entorno): Canales {
  const hayWhatsApp = Boolean(entorno.WHATSAPP_TOKEN && entorno.WHATSAPP_ID_TELEFONO);
  const hayEmail = Boolean(entorno.RESEND_API_KEY && entorno.EMAIL_REMITENTE);

  console.warn(
    `Canales de notificación: WhatsApp ${hayWhatsApp ? 'real' : 'SIMULADO'}, ` +
      `email ${hayEmail ? 'real' : 'SIMULADO'}.`,
  );

  return {
    whatsapp:
      hayWhatsApp && entorno.WHATSAPP_TOKEN && entorno.WHATSAPP_ID_TELEFONO
        ? new CanalWhatsApp(entorno.WHATSAPP_TOKEN, entorno.WHATSAPP_ID_TELEFONO)
        : new CanalSimulado('whatsapp'),
    email:
      hayEmail && entorno.RESEND_API_KEY && entorno.EMAIL_REMITENTE
        ? new CanalEmail(entorno.RESEND_API_KEY, entorno.EMAIL_REMITENTE)
        : new CanalSimulado('email'),
  };
}
