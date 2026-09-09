// Verifica que el contenedor de Nest pueda armar el módulo.
//
// Existe por un error concreto: el arreglo automático de la regla
// `consistent-type-imports` convirtió el import del servicio en `import type`,
// que desaparece en tiempo de ejecución. La metadata del decorador quedó en
// `Function`, Nest no pudo resolver la dependencia y la API no arrancaba.
//
// Ni los tipos, ni el linteo, ni las pruebas del dominio lo detectaron: sólo se
// ve al construir el módulo de verdad. Por eso esta prueba no toca la lógica,
// solamente comprueba que el grafo de dependencias se resuelva.
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { BASE_DATOS } from '../../comun/base-datos/base-datos.modulo';
import { DisponibilidadControlador } from './disponibilidad.controlador';
import { DisponibilidadModulo } from './disponibilidad.modulo';
import { DisponibilidadServicio } from './disponibilidad.servicio';

/**
 * Reemplaza al módulo real de base de datos.
 *
 * Es global igual que el verdadero, porque justamente eso es parte de lo que se
 * verifica: que el módulo de disponibilidad reciba la conexión sin importarla.
 * La conexión en sí no se usa: acá no se ejecuta ninguna consulta.
 */
@Global()
@Module({
  providers: [{ provide: BASE_DATOS, useValue: {} }],
  exports: [BASE_DATOS],
})
class BaseDatosFalsaModulo {}

describe('DisponibilidadModulo', () => {
  it('resuelve el controlador con su servicio inyectado', async () => {
    const modulo = await Test.createTestingModule({
      imports: [BaseDatosFalsaModulo, DisponibilidadModulo],
    }).compile();

    expect(modulo.get(DisponibilidadControlador)).toBeInstanceOf(DisponibilidadControlador);
    expect(modulo.get(DisponibilidadServicio)).toBeInstanceOf(DisponibilidadServicio);

    await modulo.close();
  });
});
