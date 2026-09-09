// Provee la conexión a PostgreSQL al resto de la API.
//
// La API usa la conexión agrupada (DATABASE_URL). La directa es del worker y de
// las migraciones, que necesitan locks de sesión que el pooler no mantiene.
import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { crearConexion, type BaseDatos, type ConexionBaseDatos } from '@manly/base-datos';

import type { Entorno } from '../../configuracion/entorno';

export const BASE_DATOS = Symbol('BASE_DATOS');
const CONEXION = Symbol('CONEXION_BASE_DATOS');

@Global()
@Module({
  providers: [
    {
      provide: CONEXION,
      inject: [ConfigService],
      useFactory: (configuracion: ConfigService<Entorno, true>): ConexionBaseDatos =>
        crearConexion({ url: configuracion.get('DATABASE_URL', { infer: true }) }),
    },
    {
      provide: BASE_DATOS,
      inject: [CONEXION],
      useFactory: (conexion: ConexionBaseDatos): BaseDatos => conexion.bd,
    },
  ],
  exports: [BASE_DATOS],
})
export class BaseDatosModulo implements OnApplicationShutdown {
  // El proveedor se registra con un símbolo, así que hay que pedirlo
  // explícitamente: Nest no puede inferirlo desde el tipo.
  constructor(@Inject(CONEXION) private readonly conexion: ConexionBaseDatos) {}

  async onApplicationShutdown(): Promise<void> {
    await this.conexion.pool.end();
  }
}
