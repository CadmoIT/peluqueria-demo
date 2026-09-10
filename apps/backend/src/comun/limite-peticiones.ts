// Límite de peticiones por dirección de origen.
//
// Existe por dos motivos distintos:
//
//   1. **Fuerza bruta contra el panel.** Argon2id hace lenta cada verificación,
//      pero nada impide probar contraseñas toda la noche. El límite estricto de
//      `panel/acceso` es lo que convierte "probar un diccionario" en algo que
//      lleva años en vez de una noche.
//   2. **Abuso del flujo de reserva.** Retener un horario no cuesta nada y lo
//      bloquea diez minutos. Sin techo, un script deja la agenda entera
//      inutilizable sin pagar un peso.
//
// El guardián es el `ThrottlerGuard` de Nest sin envolver. Se intentó extenderlo
// para cambiar cómo identifica el origen y **fue un error**: una subclase sin
// constructor propio no recibe las dependencias del padre, así que el `Reflector`
// quedaba en `undefined` y toda petición terminaba en 500. La forma correcta es
// `getTracker` en las opciones del módulo, que es lo que se hace acá.
import { Throttle, seconds, type ThrottlerGetTrackerFunction } from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * De qué dirección viene la petición.
 *
 * Detrás de un proxy, `req.ip` es la del proxy: **todo el tráfico caería en el
 * mismo balde y un solo abusador dejaría afuera a todos**. Por eso se lee
 * `x-forwarded-for`, y por eso `main.ts` activa `trust proxy` en producción.
 * Sin un proxy adelante esa cabecera es falsificable, y por eso no se confía en
 * ella fuera de producción.
 */
export const rastrearOrigen: ThrottlerGetTrackerFunction = (peticion) => {
  const { headers, ip } = peticion as Request;
  const reenviada = headers['x-forwarded-for'];
  const primera = Array.isArray(reenviada) ? reenviada[0] : reenviada?.split(',')[0];

  return primera?.trim() ?? ip ?? 'desconocida';
};

/**
 * Límite estricto para las rutas que verifican credenciales.
 *
 * Diez por minuto: nadie escribe mal su contraseña diez veces seguidas, y a ese
 * ritmo probar un diccionario deja de ser viable.
 */
export const LimiteAcceso = () => Throttle({ default: { ttl: seconds(60), limit: 10 } });

/**
 * Límite de las rutas que retienen horarios.
 *
 * Quince por hora. Retener no cuesta nada y bloquea diez minutos de agenda, así
 * que sin techo un script deja el día entero inutilizable sin pagar un peso.
 */
export const LimiteReserva = () => Throttle({ default: { ttl: seconds(3600), limit: 15 } });
