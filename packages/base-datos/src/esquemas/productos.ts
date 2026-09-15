// La línea de productos que se muestra en la web.
//
// **No es un catálogo de venta.** Acá no hay stock, ni carrito, ni pago: es una
// vitrina, y el producto se compra en el local. Por eso la tabla no tiene nada
// de lo que pediría una tienda —unidades, variantes, impuestos—; si algún día
// se vende online, eso es otro modelo y otra conversación.
//
// Existe para que cambiar la línea deje de ser tocar el código. Estaba escrita
// a mano en la página de inicio: renombrar un producto o sacarlo de la vitrina
// obligaba a un despliegue.
import { sql } from 'drizzle-orm';
import { boolean, check, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { marcasDeTiempo } from './comunes';

export const productos = pgTable(
  'productos',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    nombre: text('nombre').notNull(),
    /** La línea en versales sobre el nombre: «Fijación fuerte · base agua». */
    detalle: text('detalle'),
    /**
     * Precio de referencia, para que alguien sepa cuánto sale antes de ir.
     * En null no se muestra ningún precio, que es mejor que mostrar uno viejo.
     */
    precioCentavos: integer('precio_centavos'),
    /**
     * Qué fotografía usar, por clave del catálogo de imágenes de la marca.
     *
     * Se guarda la clave y no la ruta porque el archivo tiene que existir: una
     * ruta escrita a mano en el panel dejaría un hueco roto en la portada. El
     * frontend la resuelve contra su catálogo y cae en el respaldo si no la
     * reconoce. Sumar una fotografía nueva sigue siendo dejar el archivo y
     * anotarlo ahí.
     */
    imagenClave: text('imagen_clave').notNull(),
    activo: boolean('activo').notNull().default(true),
    orden: integer('orden').notNull().default(0),
    ...marcasDeTiempo,
  },
  (tabla) => [
    check(
      'productos_precio_no_negativo',
      sql`${tabla.precioCentavos} IS NULL OR ${tabla.precioCentavos} >= 0`,
    ),
  ],
);
