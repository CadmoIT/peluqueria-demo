-- La línea de productos, que estaba escrita en el código.
--
-- Es una vitrina, no una tienda: sin stock, sin carrito y sin pago. Se guarda
-- la clave de la fotografía y no su ruta, para que el panel no pueda dejar un
-- hueco roto en la portada escribiendo una que no existe.
--
-- Nota para la próxima: `drizzle-kit generate` sacó acá también `estado_worker`
-- y los cambios de `configuracion_negocio`, que ya viven en 0005 y 0006. Es que
-- esas dos se escribieron a mano sin actualizar el registro de drizzle, así que
-- para él no existían. Se recortó a lo único nuevo. El registro que acompaña a
-- esta migración ya quedó completo, de modo que la próxima generación no debería
-- repetir nada; conviene igual leer lo que genere antes de darlo por bueno.

CREATE TABLE "productos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"detalle" text,
	"precio_centavos" integer,
	"imagen_clave" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "productos_precio_no_negativo" CHECK ("productos"."precio_centavos" IS NULL OR "productos"."precio_centavos" >= 0)
);
