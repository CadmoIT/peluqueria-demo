// Checkout simulado.
//
// Reemplaza la pantalla de Mercado Pago cuando no hay credenciales: muestra el
// monto y deja elegir el resultado del pago. Al elegirlo, se dispara el mismo
// procesamiento que dispararía una notificación real, firma incluida, así que
// el flujo que se ejercita es el de producción y no un atajo.
//
// **Sólo existe con la pasarela simulada.** Si hay credenciales configuradas,
// este controlador no se registra y las rutas no existen.
import { Controller, Get, NotFoundException, Param, Post, Query, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

import type { Entorno } from '../../configuracion/entorno';
import { firmarNotificacion } from './dominio/firma-webhook';
import { PagosServicio } from './pagos.servicio';
import type { EstadoPasarela } from './pasarela/pasarela';
import { SimuladaPasarela } from './pasarela/simulada.pasarela';

/** Escapa el texto que se interpola en el HTML de la pantalla. */
function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

@ApiExcludeController()
@Controller('pagos/simulado')
export class SimuladoControlador {
  constructor(
    private readonly pasarela: SimuladaPasarela,
    private readonly pagos: PagosServicio,
    private readonly configuracion: ConfigService<Entorno, true>,
  ) {}

  @Get(':preferenciaId')
  pantalla(@Param('preferenciaId') preferenciaId: string, @Res() respuesta: Response): void {
    const datos = this.pasarela.datosDePreferencia(preferenciaId);

    if (!datos) {
      throw new NotFoundException('Esa preferencia no existe.');
    }

    const monto = (datos.montoCentavos / 100).toLocaleString('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    });

    respuesta.type('html').send(`<!doctype html>
<html lang="es-AR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Checkout simulado</title>
  <style>
    :root { color-scheme: light }
    body { font-family: system-ui, sans-serif; margin: 0; display: grid; place-items: center;
           min-height: 100dvh; background: #f6f6f6; color: #111 }
    main { background: #fff; border: 1px solid #ddd; border-radius: 4px; padding: 2rem;
           max-width: 26rem; width: calc(100% - 2rem) }
    .aviso { background: #fff4d6; border: 1px solid #e5c76b; border-radius: 3px;
             padding: .75rem 1rem; font-size: .82rem; margin-bottom: 1.5rem }
    h1 { font-size: 1.1rem; margin: 0 0 .25rem }
    .monto { font-size: 2rem; margin: .5rem 0 1.5rem }
    form { display: flex; flex-direction: column; gap: .5rem }
    button { min-height: 44px; border-radius: 3px; border: 1px solid #111; background: #fff;
             font: inherit; font-size: .9rem; cursor: pointer }
    button.aprobar { background: #111; color: #fff }
  </style>
</head>
<body>
  <main>
    <p class="aviso"><strong>Checkout simulado.</strong> No se cobra dinero real.
       Esta pantalla reemplaza a Mercado Pago porque no hay credenciales configuradas.</p>

    <h1>${escapar(datos.descripcion)}</h1>
    <p class="monto">${escapar(monto)}</p>

    <form method="post">
      <button class="aprobar" formaction="${escapar(preferenciaId)}/resolver?estado=aprobado">
        Pagar (aprobado)
      </button>
      <button formaction="${escapar(preferenciaId)}/resolver?estado=rechazado">
        Simular pago rechazado
      </button>
      <button formaction="${escapar(preferenciaId)}/resolver?estado=pendiente">
        Simular pago pendiente
      </button>
    </form>
  </main>
</body>
</html>`);
  }

  @Post(':preferenciaId/resolver')
  async resolver(
    @Param('preferenciaId') preferenciaId: string,
    @Query('estado') estado: string,
    @Res() respuesta: Response,
  ): Promise<void> {
    const datos = this.pasarela.datosDePreferencia(preferenciaId);

    if (!datos) {
      throw new NotFoundException('Esa preferencia no existe.');
    }

    const estadoValido: EstadoPasarela =
      estado === 'aprobado' || estado === 'rechazado' ? estado : 'pendiente';

    const pago = this.pasarela.resolverPago(preferenciaId, estadoValido);

    if (!pago) {
      throw new NotFoundException('No se pudo registrar el pago simulado.');
    }

    // Se firma la notificación igual que lo haría la pasarela real, y se
    // procesa por el mismo camino: así lo que se ejercita es el flujo de
    // producción, no un atajo que sólo funciona en desarrollo.
    const secreto = this.configuracion.get('MP_SECRETO_WEBHOOK', { infer: true }) ?? '';

    const firma = firmarNotificacion({
      idRecurso: pago.id,
      idPeticion: `simulada-${pago.id}`,
      secreto,
    });

    if (
      this.pagos.verificarFirma({
        cabeceraFirma: firma.cabeceraFirma,
        idPeticion: firma.idPeticion,
        idRecurso: pago.id,
      })
    ) {
      await this.pagos.procesarNotificacion(pago.id);
    }

    respuesta.redirect(datos.urlRetorno);
  }
}
