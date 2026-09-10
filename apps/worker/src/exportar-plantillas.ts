// Imprime las plantillas de WhatsApp listas para cargar en Meta.
//
//   pnpm --filter @manly/worker plantillas
//
// Existe porque alguien tiene que transcribir siete plantillas al
// administrador de WhatsApp Business, con el orden de sus parámetros exacto, y
// hacerlo leyendo código TypeScript es pedir un error. Un parámetro corrido de
// lugar manda el nombre de la sucursal donde va la hora, y eso no se descubre
// hasta que un cliente lo recibe.
//
// La fuente sigue siendo `plantillas.ts`: esto no duplica los textos, los
// deriva armando un mensaje de ejemplo y reemplazando cada valor por su
// marcador `{{n}}`.
import { armarMensaje, TIPOS_MENSAJE, type DatosMensaje } from './notificaciones/plantillas';

/**
 * Datos de ejemplo, elegidos para ser reconocibles dentro del texto.
 *
 * Cada uno tiene que ser una cadena que no aparezca por casualidad en el
 * cuerpo del mensaje: si se usara "Manly" como nombre de sucursal, el
 * reemplazo también pisaría la palabra en el saludo.
 */
const EJEMPLO: DatosMensaje = {
  clienteNombre: '«NOMBRE»',
  sucursalNombre: '«SUCURSAL»',
  sucursalDireccion: '«DIRECCION»',
  comienzaEn: '2026-09-10T18:30:00.000Z',
  servicios: ['«SERVICIOS»'],
  urlGestion: '«ENLACE»',
  horasMinimasCancelacion: 24,
};

/**
 * Qué significa cada dato, para la columna de ejemplos que pide Meta.
 *
 * Las claves son los valores de ejemplo tal como salen armados: sucursal y
 * dirección viajan juntas en un solo parámetro, así que acá también.
 */
const SIGNIFICADOS: Record<string, string> = {
  '«NOMBRE»': 'Nombre del cliente',
  '«SUCURSAL» — «DIRECCION»': 'Sucursal y dirección',
  '«SERVICIOS»': 'Servicios del turno',
  '«ENLACE»': 'Enlace privado para ver o cambiar el turno',
  '24': 'Horas mínimas para cancelar',
};

function describir(valor: string): string {
  return SIGNIFICADOS[valor] ?? 'Fecha y hora del turno';
}

function exportar(): void {
  console.warn('Plantillas de WhatsApp para el administrador de Meta.');
  console.warn('Categoría: UTILITY en todas. Idioma: es_AR.\n');
  console.warn(
    'El orden de los parámetros es contrato: si se reordena acá hay que\n' +
      'reordenarlo en plantillas.ts, o los mensajes salen con los datos\n' +
      'cambiados de lugar.\n',
  );

  for (const tipo of TIPOS_MENSAJE) {
    const mensaje = armarMensaje(tipo, EJEMPLO);

    // El cuerpo con los valores reemplazados por {{1}}, {{2}}…
    let cuerpo = mensaje.texto;

    mensaje.parametros.forEach((valor, indice) => {
      cuerpo = cuerpo.split(valor).join(`{{${String(indice + 1)}}}`);
    });

    console.warn('─'.repeat(72));
    console.warn(`\nNombre:  ${mensaje.plantilla}`);
    console.warn(`Se usa:  ${tipo.replace(/_/g, ' ')}\n`);
    console.warn('Cuerpo:');
    console.warn(
      cuerpo
        .split('\n')
        .map((linea) => `  ${linea}`)
        .join('\n'),
    );
    console.warn('\nParámetros:');

    mensaje.parametros.forEach((valor, indice) => {
      console.warn(`  {{${String(indice + 1)}}}  ${describir(valor)}`);
    });

    console.warn('');
  }

  console.warn('─'.repeat(72));
  console.warn(`\n${String(TIPOS_MENSAJE.length)} plantillas.\n`);
}

exportar();
