// Cliente HTTP de la API de reservas.
// Centraliza la URL base y el manejo de errores para que los componentes no
// repitan la lógica de fetch.
const URL_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export class ErrorApi extends Error {
  constructor(
    readonly estado: number,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorApi';
  }
}

export async function consultarApi<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const respuesta = await fetch(`${URL_BASE}${ruta}`, {
    ...opciones,
    headers: {
      'Content-Type': 'application/json',
      ...opciones.headers,
    },
    credentials: 'include',
  });

  if (!respuesta.ok) {
    const cuerpo = (await respuesta.json().catch(() => null)) as { mensaje?: string } | null;
    throw new ErrorApi(
      respuesta.status,
      cuerpo?.mensaje ?? 'Error al comunicarse con el servidor.',
    );
  }

  return (await respuesta.json()) as T;
}
