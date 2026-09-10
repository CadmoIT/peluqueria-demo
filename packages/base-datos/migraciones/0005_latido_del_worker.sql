-- Latido del worker.
--
-- El worker corre en otro servicio, con su propia configuración. Sin esta fila
-- la API no tiene forma de saber si sigue tomando trabajo ni si sus canales de
-- notificación son reales o simulados, y el simulador registra los envíos como
-- exitosos: nadie se entera de que los avisos no salen.
CREATE TABLE IF NOT EXISTS "estado_worker" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "fila_unica" boolean DEFAULT true NOT NULL,
  "ultima_corrida" timestamp with time zone DEFAULT now() NOT NULL,
  "canal_whatsapp" text DEFAULT 'simulado' NOT NULL,
  "canal_email" text DEFAULT 'simulado' NOT NULL,
  "version" text,
  CONSTRAINT "estado_worker_fila_unica_es_true" CHECK ("estado_worker"."fila_unica" = true),
  CONSTRAINT "estado_worker_canales_validos" CHECK (
    "estado_worker"."canal_whatsapp" IN ('real', 'simulado')
    AND "estado_worker"."canal_email" IN ('real', 'simulado')
  )
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "estado_worker_fila_unica" ON "estado_worker" USING btree ("fila_unica");
