// Crea la primera invitación al panel.
//
// Resuelve el problema del arranque: sólo gerencia puede invitar, pero al
// principio no hay nadie de gerencia. Se corre una vez por entorno, a mano.
//
//   pnpm --filter @manly/backend invitar -- alguien@manly.ar "Nombre" gerencia
//
// Imprime el enlace en la consola. **No se manda por correo**: en el arranque
// todavía puede no haber canal configurado, y un enlace de invitación en un log
// de correo es un riesgo innecesario. Se copia y se pasa por donde corresponda.
//
// Usa la conexión real del entorno, así que sirve igual en desarrollo, staging
// y producción.
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { AutenticacionServicio } from './modulos/autenticacion/autenticacion.servicio';

async function principal(): Promise<void> {
  const [email, nombre, rol = 'gerencia'] = process.argv.slice(2);

  if (!email || !nombre) {
    console.error('Uso: invitar <email> <nombre> [gerencia|profesional]');
    process.exit(1);
  }

  if (rol !== 'gerencia' && rol !== 'profesional') {
    console.error(`Rol inválido: ${rol}. Tiene que ser gerencia o profesional.`);
    process.exit(1);
  }

  const aplicacion = await NestFactory.createApplicationContext(AppModule, { logger: false });

  try {
    const autenticacion = aplicacion.get(AutenticacionServicio);
    const { url } = await autenticacion.invitar({ email, nombre, rol });

    console.warn(`\nInvitación creada para ${email} (${rol}).`);
    console.warn(`Vence en 7 días. Pasale este enlace:\n\n  ${url}\n`);
  } finally {
    await aplicacion.close();
  }
}

principal().catch((error: unknown) => {
  console.error('No se pudo crear la invitación:', error);
  process.exit(1);
});
