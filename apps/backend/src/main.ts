// Arranque de la API: seguridad, CORS, prefijo de rutas y documentación OpenAPI.
import 'reflect-metadata';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { ExcepcionHttpFiltro } from './comun/filtros/excepcion-http.filtro';
import { origenesPermitidos, type Entorno } from './configuracion/entorno';

async function arrancar(): Promise<void> {
  const aplicacion = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const configuracion = aplicacion.get(ConfigService<Entorno, true>);

  const puerto = configuracion.get('API_PUERTO', { infer: true });
  const prefijo = configuracion.get('API_PREFIJO', { infer: true });
  const enProduccion = configuracion.get('NODE_ENV', { infer: true }) === 'production';

  // En producción hay un proxy adelante (Railway), así que `req.ip` sería su
  // dirección y no la de quien pide. Sin esto **todo el tráfico caería en el
  // mismo balde del limitador** y un solo abusador dejaría afuera a todos; la
  // auditoría, además, registraría siempre la misma dirección.
  //
  // Se activa sólo en producción: confiar en `x-forwarded-for` sin un proxy
  // adelante deja que cualquiera falsifique su origen mandando la cabecera.
  if (enProduccion) {
    aplicacion.set('trust proxy', 1);
  }

  aplicacion.use(helmet());
  // La sesión del panel viaja en una cookie httpOnly.
  aplicacion.use(cookieParser());
  aplicacion.enableCors({
    origin: origenesPermitidos(configuracion.get('ORIGENES_PERMITIDOS', { infer: true })),
    credentials: true,
  });
  aplicacion.setGlobalPrefix(prefijo);
  aplicacion.useGlobalFilters(new ExcepcionHttpFiltro());
  // La validacion de cuerpos y respuestas se hace con los contratos Zod de
  // @manly/contratos, no con el ValidationPipe de Nest (que exige class-validator).
  aplicacion.enableShutdownHooks();

  // La documentación queda fuera de producción. No es un agujero de seguridad
  // —las rutas están protegidas igual—, pero publicar el mapa completo de la
  // API interna le ahorra trabajo a quien quiera buscarle la vuelta, y no le
  // sirve a nadie más: el único cliente es este mismo repositorio.
  if (!enProduccion) {
    const documento = new DocumentBuilder()
      .setTitle('API de reservas de Manly')
      .setDescription('Servicios de disponibilidad, reservas, pagos y panel interno.')
      .setVersion('1.0')
      .build();

    SwaggerModule.setup(`${prefijo}/documentacion`, aplicacion, () =>
      SwaggerModule.createDocument(aplicacion, documento),
    );
  }

  await aplicacion.listen(puerto, '0.0.0.0');
}

arrancar().catch((error: unknown) => {
  console.error('No se pudo arrancar la API:', error);
  process.exit(1);
});
