// Agrupa el catálogo público.
import { Module } from '@nestjs/common';

import { CatalogoControlador } from './catalogo.controlador';
import { CatalogoServicio } from './catalogo.servicio';

@Module({
  controllers: [CatalogoControlador],
  providers: [CatalogoServicio],
  exports: [CatalogoServicio],
})
export class CatalogoModulo {}
