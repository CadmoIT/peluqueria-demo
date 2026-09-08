// Arranque de la API: seguridad, CORS, prefijo de rutas y documentación OpenAPI.
import 'reflect-metadata';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { ExcepcionHttpFiltro } from './comun/filtros/excepcion-http.filtro';
import { origenesPermitidos, type Entorno } from './configuracion/entorno';

async function arrancar(): Promise<void> {
  const aplicacion = await NestFactory.create(AppModule, { bufferLogs: true });
  const configuracion = aplicacion.get(ConfigService<Entorno, true>);

  const puerto = configuracion.get('API_PUERTO', { infer: true });
  const prefijo = configuracion.get('API_PREFIJO', { infer: true });

  aplicacion.use(helmet());
  aplicacion.enableCors({
    origin: origenesPermitidos(configuracion.get('ORIGENES_PERMITIDOS', { infer: true })),
    credentials: true,
  });
  aplicacion.setGlobalPrefix(prefijo);
  aplicacion.useGlobalFilters(new ExcepcionHttpFiltro());
  // La validacion de cuerpos y respuestas se hace con los contratos Zod de
  // @manly/contratos, no con el ValidationPipe de Nest (que exige class-validator).
  aplicacion.enableShutdownHooks();

  const documento = new DocumentBuilder()
    .setTitle('API de reservas de Manly')
    .setDescription('Servicios de disponibilidad, reservas, pagos y panel interno.')
    .setVersion('1.0')
    .build();

  SwaggerModule.setup(`${prefijo}/documentacion`, aplicacion, () =>
    SwaggerModule.createDocument(aplicacion, documento),
  );

  await aplicacion.listen(puerto, '0.0.0.0');
}

arrancar().catch((error: unknown) => {
  console.error('No se pudo arrancar la API:', error);
  process.exit(1);
});
