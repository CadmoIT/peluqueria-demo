ALTER TABLE "reservas" DROP CONSTRAINT "reservas_contacto_coherente";--> statement-breakpoint
ALTER TABLE "reservas" ALTER COLUMN "cliente_nombre" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reservas" ALTER COLUMN "canal_contacto" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reservas" ALTER COLUMN "acepto_condiciones_en" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_datos_completos_si_esta_activa" CHECK (
        "reservas"."estado" NOT IN ('confirmada', 'completada', 'ausente')
        OR (
          "reservas"."cliente_nombre" IS NOT NULL
          AND "reservas"."canal_contacto" IS NOT NULL
          AND "reservas"."acepto_condiciones_en" IS NOT NULL
        )
      );--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_contacto_coherente" CHECK (
        "reservas"."canal_contacto" IS NULL
        OR ("reservas"."canal_contacto" = 'whatsapp' AND "reservas"."contacto_whatsapp" IS NOT NULL)
        OR ("reservas"."canal_contacto" = 'email' AND "reservas"."contacto_email" IS NOT NULL)
      );