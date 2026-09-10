// Verifica que el contenedor de Nest pueda armar la aplicación entera.
//
// Es la hermana mayor de `disponibilidad.modulo.spec.ts`, que nació de un error
// concreto: un import convertido en `import type` desaparece en tiempo de
// ejecución, la metadata del decorador queda en `Function` y Nest no puede
// resolver la dependencia. Ni los tipos, ni el linteo, ni las pruebas de
// dominio lo detectan; sólo se ve al construir el grafo de verdad.
//
// Con el panel el riesgo creció: son varios módulos que se importan entre sí
// —agenda usa reservas, solicitudes usa reservas y notificaciones, usuarios usa
// autenticación— y cualquiera de esos hilos mal atado deja la API sin arrancar.
// Esta prueba no ejerce lógica: comprueba que todo el grafo se resuelva y que
// las rutas del panel queden registradas.
import 'reflect-metadata';
import './configuracion/entorno-memoria';

import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AppModule } from './app.module';
import { BASE_DATOS } from './comun/base-datos/base-datos.modulo';
import { AdministracionControlador } from './modulos/administracion/administracion.controlador';
import { AgendaControlador } from './modulos/agenda/agenda.controlador';
import { ReservasPanelControlador } from './modulos/agenda/reservas-panel.controlador';
import { AuditoriaControlador } from './modulos/auditoria/auditoria.controlador';
import { FallasControlador } from './modulos/notificaciones/fallas.controlador';
import { PagosPanelControlador } from './modulos/pagos/pagos-panel.controlador';
import { SolicitudesControlador } from './modulos/solicitudes/solicitudes.controlador';
import { UsuariosControlador } from './modulos/usuarios/usuarios.controlador';

/** Ocupa el lugar de la conexión real. Acá no se ejecuta ninguna consulta. */
@Global()
@Module({
  providers: [{ provide: BASE_DATOS, useValue: {} }],
  exports: [BASE_DATOS],
})
class BaseDatosFalsaModulo {}

describe('AppModule', () => {
  it('resuelve todos los controladores del panel', async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BASE_DATOS)
      .useValue({})
      .compile();

    for (const controlador of [
      AgendaControlador,
      ReservasPanelControlador,
      SolicitudesControlador,
      AdministracionControlador,
      UsuariosControlador,
      AuditoriaControlador,
      PagosPanelControlador,
      FallasControlador,
    ]) {
      expect(modulo.get(controlador)).toBeInstanceOf(controlador);
    }

    await modulo.close();
  });

  it('arma la aplicación aunque la conexión venga de afuera', async () => {
    const modulo = await Test.createTestingModule({
      imports: [BaseDatosFalsaModulo, AppModule],
    })
      .overrideProvider(BASE_DATOS)
      .useValue({})
      .compile();

    const aplicacion = modulo.createNestApplication();

    await aplicacion.init();
    await aplicacion.close();
  });
});
