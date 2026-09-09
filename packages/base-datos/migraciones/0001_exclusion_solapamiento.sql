-- Impide que un profesional quede con dos bloques superpuestos, incluso cuando
-- dos personas reservan al mismo tiempo.
--
-- Es una garantía de la base, no de la aplicación: dos transacciones
-- concurrentes que pasen ambas la verificación previa igual chocan acá y una
-- de las dos falla. Sin esto, la carrera termina en doble reserva.

CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint

-- Se compara la ventana ocupada, que incluye preparación y limpieza: dos
-- bloques pueden verse contiguos para el cliente y aun así pisarse.
-- El rango es `[)`: un bloque que termina 14:00 y otro que empieza 14:00 no
-- se solapan.
-- El filtro deja fuera los estados que ya liberaron la agenda (cancelada,
-- expirada, completada, ausente).
ALTER TABLE "reservas_servicios"
  ADD CONSTRAINT "reservas_servicios_sin_solapamiento"
  EXCLUDE USING gist (
    "profesional_id" WITH =,
    tstzrange("ocupa_desde", "ocupa_hasta", '[)') WITH &&
  ) WHERE ("estado" IN ('pendiente_pago', 'confirmada'));--> statement-breakpoint

-- `reservas_servicios.estado` es una copia de `reservas.estado`. Hace falta
-- desnormalizarlo porque una restricción EXCLUDE sólo puede filtrar por
-- columnas de su propia tabla. Este trigger es el único que lo escribe.
CREATE OR REPLACE FUNCTION propagar_estado_reserva()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."estado" IS DISTINCT FROM OLD."estado" THEN
    UPDATE "reservas_servicios"
      SET "estado" = NEW."estado",
          "actualizado_en" = now()
      WHERE "reserva_id" = NEW."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER "reservas_propagar_estado"
  AFTER UPDATE OF "estado" ON "reservas"
  FOR EACH ROW
  EXECUTE FUNCTION propagar_estado_reserva();--> statement-breakpoint

-- Al insertar un bloque, su estado sale de la reserva: que la aplicación mande
-- uno distinto no debe poder burlar la exclusión.
CREATE OR REPLACE FUNCTION heredar_estado_reserva()
RETURNS TRIGGER AS $$
BEGIN
  SELECT "estado" INTO NEW."estado" FROM "reservas" WHERE "id" = NEW."reserva_id";
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER "reservas_servicios_heredar_estado"
  BEFORE INSERT ON "reservas_servicios"
  FOR EACH ROW
  EXECUTE FUNCTION heredar_estado_reserva();--> statement-breakpoint

-- Mantiene actualizado_en al día sin que la aplicación tenga que acordarse.
CREATE OR REPLACE FUNCTION tocar_actualizado_en()
RETURNS TRIGGER AS $$
BEGIN
  NEW."actualizado_en" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sucursales', 'servicios', 'usuarios', 'profesionales',
    'horarios_semanales', 'excepciones_horario', 'reservas', 'reservas_servicios',
    'pagos', 'solicitudes_cambio', 'notificaciones', 'configuracion_negocio'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION tocar_actualizado_en()',
      t || '_tocar_actualizado', t
    );
  END LOOP;
END $$;
