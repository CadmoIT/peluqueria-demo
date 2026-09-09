// Orquesta la búsqueda de disponibilidad.
//
// Trae el contexto de la base, se lo pasa al motor (que es lógica pura) y
// traduce el resultado al contrato que consume la web. Las reglas de negocio
// viven en `dominio/`; acá sólo se acota la ventana y se arman los datos.
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { calcularSenia, cargarContextoDisponibilidad, type BaseDatos } from '@manly/base-datos';
import type { BusquedaDisponibilidad, RespuestaDisponibilidad } from '@manly/contratos';

import { BASE_DATOS } from '../../comun/base-datos/base-datos.modulo';
import { calcularFranjasDeTrabajo } from './dominio/calendario';
import { generarItinerarios, type ServicioSolicitado } from './dominio/itinerarios';

/** Granularidad de los horarios que se le ofrecen al cliente. */
const PASO_MINUTOS = 15;

/** Tope de opciones por búsqueda. Más que esto no le sirve a nadie. */
const MAXIMO_OPCIONES = 60;

@Injectable()
export class DisponibilidadServicio {
  constructor(@Inject(BASE_DATOS) private readonly bd: BaseDatos) {}

  async buscar(peticion: BusquedaDisponibilidad): Promise<RespuestaDisponibilidad> {
    const rango = this.acotarRango(peticion);

    const servicioIds = peticion.servicios.map((servicio) => servicio.servicioId);

    const contexto = await cargarContextoDisponibilidad(this.bd, {
      sucursalId: peticion.sucursalId,
      servicioIds: [...new Set(servicioIds)],
      rango: { desde: new Date(rango.desde), hasta: new Date(rango.hasta) },
    });

    if (peticion.servicios.length > contexto.configuracion.maximoServiciosPorReserva) {
      throw new BadRequestException(
        `Se pueden reservar hasta ${String(contexto.configuracion.maximoServiciosPorReserva)} servicios juntos.`,
      );
    }

    const porId = new Map(contexto.servicios.map((servicio) => [servicio.id, servicio]));

    // Un servicio que no existe, está inactivo o no se presta en la sucursal es
    // un error del pedido, no una búsqueda sin resultados.
    const faltantes = servicioIds.filter((id) => !porId.has(id));

    if (faltantes.length > 0) {
      throw new NotFoundException(
        'Alguno de los servicios pedidos no existe o no se presta en esa sucursal.',
      );
    }

    const solicitados: ServicioSolicitado[] = peticion.servicios.map((pedido) => {
      const servicio = porId.get(pedido.servicioId)!;

      return {
        servicioId: servicio.id,
        nombre: servicio.nombre,
        duracionMinutos: servicio.duracionMinutos,
        minutosPreparacion: servicio.minutosPreparacion,
        minutosLimpieza: servicio.minutosLimpieza,
        precioCentavos: servicio.precioCentavos,
        seniaCentavos: calcularSenia(servicio),
        profesionalPreferidoId: pedido.profesionalId,
        profesionalesCompatibles: contexto.compatiblesPorServicio.get(servicio.id) ?? [],
      };
    });

    // El horizonte sale de la configuración, así que se aplica recién ahora.
    // Consultar de más no hace daño; ofrecer de más, sí.
    const rangoOfrecible = {
      desde: rango.desde,
      hasta: Math.min(
        rango.hasta,
        Date.now() + contexto.configuracion.diasHorizonte * 24 * 60 * 60 * 1000,
      ),
    };

    if (rangoOfrecible.hasta <= rangoOfrecible.desde) {
      return { opciones: [], hayMas: false };
    }

    const franjasPorProfesional = calcularFranjasDeTrabajo({
      zonaHoraria: contexto.configuracion.zonaHoraria,
      sucursalId: peticion.sucursalId,
      profesionalIds: [...contexto.nombresProfesionales.keys()],
      horarios: contexto.horarios,
      excepciones: contexto.excepciones,
      rango: rangoOfrecible,
    });

    const { itinerarios, hayMas } = generarItinerarios({
      servicios: solicitados,
      franjasPorProfesional,
      ocupadoPorProfesional: contexto.ocupadoPorProfesional,
      rango: rangoOfrecible,
      pasoMinutos: PASO_MINUTOS,
      maximoOpciones: MAXIMO_OPCIONES,
      permitirReordenar: true,
    });

    return {
      hayMas,
      opciones: itinerarios.map((itinerario) => ({
        comienzaEn: new Date(itinerario.comienzaEn).toISOString(),
        terminaEn: new Date(itinerario.terminaEn).toISOString(),
        duracionTotalMinutos: itinerario.duracionTotalMinutos,
        precioTotalCentavos: itinerario.precioTotalCentavos,
        seniaTotalCentavos: itinerario.seniaTotalCentavos,
        bloques: itinerario.bloques.map((bloque) => ({
          orden: bloque.orden,
          servicioId: bloque.servicioId,
          servicioNombre: bloque.servicioNombre,
          profesionalId: bloque.profesionalId,
          profesionalNombre:
            contexto.nombresProfesionales.get(bloque.profesionalId) ?? 'Profesional',
          comienzaEn: new Date(bloque.comienzaEn).toISOString(),
          terminaEn: new Date(bloque.terminaEn).toISOString(),
          duracionMinutos: bloque.duracionMinutos,
          precioCentavos: bloque.precioCentavos,
        })),
      })),
    };
  }

  /**
   * Recorta la ventana pedida a lo que el negocio permite ofrecer: nunca hacia
   * atrás, y nunca más allá del horizonte configurado.
   */
  private acotarRango(peticion: BusquedaDisponibilidad): { desde: number; hasta: number } {
    const ahora = Date.now();
    const desde = Math.max(new Date(peticion.desde).getTime(), ahora);
    const hasta = new Date(peticion.hasta).getTime();

    if (!Number.isFinite(desde) || !Number.isFinite(hasta)) {
      throw new BadRequestException('Las fechas de la búsqueda no son válidas.');
    }

    if (hasta <= desde) {
      throw new BadRequestException('La fecha de fin tiene que ser posterior a la de inicio.');
    }

    return { desde, hasta };
  }
}
