// Cliente HTTP de la API de reservas.
//
// Centraliza la URL base y la forma de los errores para que los componentes no
// repitan la lógica de fetch ni tengan que interpretar cada respuesta.
const URL_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

/** Qué campo falló y por qué, cuando el error viene de una validación. */
export interface DetalleError {
  campo: string;
  motivo: string;
}

export class ErrorApi extends Error {
  constructor(
    readonly estado: number,
    mensaje: string,
    readonly detalles: DetalleError[] = [],
  ) {
    super(mensaje);
    this.name = 'ErrorApi';
  }

  /** El horario elegido se lo llevó otra persona mientras tanto. */
  get esConflicto(): boolean {
    return this.estado === 409;
  }
}

interface CuerpoError {
  mensaje?: string;
  detalles?: DetalleError[];
}

export async function consultarApi<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  let respuesta: Response;

  try {
    respuesta = await fetch(`${URL_BASE}${ruta}`, {
      ...opciones,
      headers: { 'Content-Type': 'application/json', ...opciones.headers },
      credentials: 'include',
    });
  } catch {
    // Sin red, o la API caída: no hay respuesta que interpretar.
    throw new ErrorApi(0, 'No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.');
  }

  if (!respuesta.ok) {
    const cuerpo = (await respuesta.json().catch(() => null)) as CuerpoError | null;

    throw new ErrorApi(
      respuesta.status,
      cuerpo?.mensaje ?? 'Algo salió mal. Probá de nuevo en un momento.',
      cuerpo?.detalles ?? [],
    );
  }

  return (await respuesta.json()) as T;
}
