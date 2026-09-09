CREATE TYPE "public"."canal_contacto" AS ENUM('whatsapp', 'email');--> statement-breakpoint
CREATE TYPE "public"."estado_notificacion" AS ENUM('pendiente', 'enviada', 'fallida', 'descartada');--> statement-breakpoint
CREATE TYPE "public"."estado_pago" AS ENUM('pendiente', 'aprobado', 'rechazado', 'cancelado', 'reintegrado');--> statement-breakpoint
CREATE TYPE "public"."estado_reserva" AS ENUM('pendiente_pago', 'confirmada', 'cancelada', 'completada', 'ausente', 'expirada');--> statement-breakpoint
CREATE TYPE "public"."estado_solicitud" AS ENUM('pendiente', 'aprobada', 'rechazada');--> statement-breakpoint
CREATE TYPE "public"."medio_pago" AS ENUM('mercado_pago', 'efectivo', 'qr_mercado_pago', 'otro');--> statement-breakpoint
CREATE TYPE "public"."modalidad_senia" AS ENUM('deshabilitada', 'fija', 'porcentual');--> statement-breakpoint
CREATE TYPE "public"."rol" AS ENUM('gerencia', 'profesional');--> statement-breakpoint
CREATE TYPE "public"."tipo_excepcion" AS ENUM('bloqueo', 'feriado', 'disponibilidad_extra');--> statement-breakpoint
CREATE TYPE "public"."tipo_notificacion" AS ENUM('confirmacion', 'recordatorio_primero', 'recordatorio_segundo', 'cancelacion', 'reprogramacion', 'solicitud_aprobada', 'solicitud_rechazada');--> statement-breakpoint
CREATE TYPE "public"."tipo_pago" AS ENUM('senia', 'saldo', 'reintegro');--> statement-breakpoint
CREATE TYPE "public"."tipo_solicitud" AS ENUM('cancelacion', 'reprogramacion');--> statement-breakpoint
CREATE TABLE "sucursales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"barrio" text NOT NULL,
	"direccion" text NOT NULL,
	"telefono" text,
	"whatsapp" text,
	"url_mapa" text,
	"horas_minimas_cancelacion" integer,
	"activa" boolean DEFAULT true NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sucursales_horas_cancelacion_no_negativas" CHECK ("sucursales"."horas_minimas_cancelacion" IS NULL OR "sucursales"."horas_minimas_cancelacion" >= 0)
);
--> statement-breakpoint
CREATE TABLE "servicios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"categoria" text,
	"duracion_minutos" integer NOT NULL,
	"minutos_preparacion" integer DEFAULT 0 NOT NULL,
	"minutos_limpieza" integer DEFAULT 0 NOT NULL,
	"precio_centavos" integer NOT NULL,
	"modalidad_senia" "modalidad_senia" DEFAULT 'deshabilitada' NOT NULL,
	"senia_fija_centavos" integer,
	"senia_porcentaje" integer,
	"horas_minimas_cancelacion" integer,
	"activo" boolean DEFAULT true NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "servicios_duracion_positiva" CHECK ("servicios"."duracion_minutos" > 0),
	CONSTRAINT "servicios_precio_no_negativo" CHECK ("servicios"."precio_centavos" >= 0),
	CONSTRAINT "servicios_buffers_no_negativos" CHECK ("servicios"."minutos_preparacion" >= 0 AND "servicios"."minutos_limpieza" >= 0),
	CONSTRAINT "servicios_porcentaje_valido" CHECK ("servicios"."senia_porcentaje" IS NULL OR ("servicios"."senia_porcentaje" > 0 AND "servicios"."senia_porcentaje" <= 100)),
	CONSTRAINT "servicios_senia_coherente" CHECK (
        ("servicios"."modalidad_senia" = 'deshabilitada'
          AND "servicios"."senia_fija_centavos" IS NULL
          AND "servicios"."senia_porcentaje" IS NULL)
        OR ("servicios"."modalidad_senia" = 'fija'
          AND "servicios"."senia_fija_centavos" IS NOT NULL
          AND "servicios"."senia_fija_centavos" > 0
          AND "servicios"."senia_porcentaje" IS NULL)
        OR ("servicios"."modalidad_senia" = 'porcentual'
          AND "servicios"."senia_porcentaje" IS NOT NULL
          AND "servicios"."senia_fija_centavos" IS NULL)
      )
);
--> statement-breakpoint
CREATE TABLE "servicios_sucursales" (
	"servicio_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	CONSTRAINT "servicios_sucursales_servicio_id_sucursal_id_pk" PRIMARY KEY("servicio_id","sucursal_id")
);
--> statement-breakpoint
CREATE TABLE "sesiones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"hash_token" text NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"ultimo_uso_en" timestamp with time zone,
	"agente_usuario" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"nombre" text NOT NULL,
	"rol" "rol" NOT NULL,
	"hash_contrasenia" text,
	"hash_token_acceso" text,
	"token_acceso_expira_en" timestamp with time zone,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profesionales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid,
	"nombre" text NOT NULL,
	"nombre_visible" text,
	"activo" boolean DEFAULT true NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profesionales_servicios" (
	"profesional_id" uuid NOT NULL,
	"servicio_id" uuid NOT NULL,
	CONSTRAINT "profesionales_servicios_profesional_id_servicio_id_pk" PRIMARY KEY("profesional_id","servicio_id")
);
--> statement-breakpoint
CREATE TABLE "profesionales_sucursales" (
	"profesional_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	CONSTRAINT "profesionales_sucursales_profesional_id_sucursal_id_pk" PRIMARY KEY("profesional_id","sucursal_id")
);
--> statement-breakpoint
CREATE TABLE "excepciones_horario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profesional_id" uuid,
	"sucursal_id" uuid,
	"tipo" "tipo_excepcion" NOT NULL,
	"comienza_en" timestamp with time zone NOT NULL,
	"termina_en" timestamp with time zone NOT NULL,
	"motivo" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "excepciones_rango_valido" CHECK ("excepciones_horario"."comienza_en" < "excepciones_horario"."termina_en"),
	CONSTRAINT "excepciones_alcance_definido" CHECK ("excepciones_horario"."profesional_id" IS NOT NULL OR "excepciones_horario"."sucursal_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "horarios_semanales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profesional_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"dia_semana" smallint NOT NULL,
	"comienza" time NOT NULL,
	"termina" time NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "horarios_dia_semana_valido" CHECK ("horarios_semanales"."dia_semana" BETWEEN 0 AND 6),
	CONSTRAINT "horarios_rango_valido" CHECK ("horarios_semanales"."comienza" < "horarios_semanales"."termina")
);
--> statement-breakpoint
CREATE TABLE "reservas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"estado" "estado_reserva" DEFAULT 'pendiente_pago' NOT NULL,
	"cliente_nombre" text NOT NULL,
	"canal_contacto" "canal_contacto" NOT NULL,
	"contacto_whatsapp" text,
	"contacto_email" text,
	"comienza_en" timestamp with time zone NOT NULL,
	"termina_en" timestamp with time zone NOT NULL,
	"precio_total_centavos" integer NOT NULL,
	"senia_total_centavos" integer DEFAULT 0 NOT NULL,
	"hash_token_gestion" text NOT NULL,
	"retencion_expira_en" timestamp with time zone,
	"acepto_condiciones_en" timestamp with time zone NOT NULL,
	"notas" text,
	"creada_por_usuario_id" uuid,
	"cancelada_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservas_rango_valido" CHECK ("reservas"."comienza_en" < "reservas"."termina_en"),
	CONSTRAINT "reservas_montos_no_negativos" CHECK ("reservas"."precio_total_centavos" >= 0),
	CONSTRAINT "reservas_senia_no_supera_precio" CHECK ("reservas"."senia_total_centavos" >= 0 AND "reservas"."senia_total_centavos" <= "reservas"."precio_total_centavos"),
	CONSTRAINT "reservas_contacto_coherente" CHECK (
        ("reservas"."canal_contacto" = 'whatsapp' AND "reservas"."contacto_whatsapp" IS NOT NULL)
        OR ("reservas"."canal_contacto" = 'email' AND "reservas"."contacto_email" IS NOT NULL)
      )
);
--> statement-breakpoint
CREATE TABLE "reservas_servicios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reserva_id" uuid NOT NULL,
	"servicio_id" uuid NOT NULL,
	"profesional_id" uuid NOT NULL,
	"orden" smallint NOT NULL,
	"comienza_en" timestamp with time zone NOT NULL,
	"termina_en" timestamp with time zone NOT NULL,
	"ocupa_desde" timestamp with time zone NOT NULL,
	"ocupa_hasta" timestamp with time zone NOT NULL,
	"estado" "estado_reserva" DEFAULT 'pendiente_pago' NOT NULL,
	"servicio_nombre" text NOT NULL,
	"duracion_minutos" integer NOT NULL,
	"precio_centavos" integer NOT NULL,
	"senia_centavos" integer DEFAULT 0 NOT NULL,
	"minutos_preparacion" integer DEFAULT 0 NOT NULL,
	"minutos_limpieza" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservas_servicios_rango_valido" CHECK ("reservas_servicios"."comienza_en" < "reservas_servicios"."termina_en"),
	CONSTRAINT "reservas_servicios_ocupacion_valida" CHECK ("reservas_servicios"."ocupa_desde" < "reservas_servicios"."ocupa_hasta"),
	CONSTRAINT "reservas_servicios_ocupacion_contiene_servicio" CHECK ("reservas_servicios"."ocupa_desde" <= "reservas_servicios"."comienza_en" AND "reservas_servicios"."ocupa_hasta" >= "reservas_servicios"."termina_en"),
	CONSTRAINT "reservas_servicios_precio_no_negativo" CHECK ("reservas_servicios"."precio_centavos" >= 0)
);
--> statement-breakpoint
CREATE TABLE "pagos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reserva_id" uuid NOT NULL,
	"tipo" "tipo_pago" NOT NULL,
	"medio" "medio_pago" NOT NULL,
	"estado" "estado_pago" DEFAULT 'pendiente' NOT NULL,
	"monto_centavos" integer NOT NULL,
	"referencia_externa" text,
	"id_pago_externo" text,
	"datos_crudos" jsonb,
	"registrado_por_usuario_id" uuid,
	"acreditado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pagos_monto_positivo" CHECK ("pagos"."monto_centavos" > 0)
);
--> statement-breakpoint
CREATE TABLE "solicitudes_cambio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reserva_id" uuid NOT NULL,
	"tipo" "tipo_solicitud" NOT NULL,
	"estado" "estado_solicitud" DEFAULT 'pendiente' NOT NULL,
	"motivo" text,
	"propuesta" jsonb,
	"respuesta" text,
	"resuelta_por_usuario_id" uuid,
	"resuelta_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notificaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reserva_id" uuid,
	"tipo" "tipo_notificacion" NOT NULL,
	"canal" "canal_contacto" NOT NULL,
	"destino" text NOT NULL,
	"estado" "estado_notificacion" DEFAULT 'pendiente' NOT NULL,
	"plantilla" text NOT NULL,
	"datos" jsonb,
	"programada_para" timestamp with time zone NOT NULL,
	"intentos" integer DEFAULT 0 NOT NULL,
	"enviada_en" timestamp with time zone,
	"ultimo_error" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "configuracion_negocio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fila_unica" boolean DEFAULT true NOT NULL,
	"horas_minimas_cancelacion" integer DEFAULT 24 NOT NULL,
	"minutos_retencion" integer DEFAULT 10 NOT NULL,
	"dias_horizonte" integer DEFAULT 60 NOT NULL,
	"maximo_servicios_por_reserva" integer DEFAULT 4 NOT NULL,
	"horas_recordatorio_primero" integer DEFAULT 24 NOT NULL,
	"horas_recordatorio_segundo" integer DEFAULT 2,
	"zona_horaria" text DEFAULT 'America/Argentina/Buenos_Aires' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "configuracion_fila_unica_es_true" CHECK ("configuracion_negocio"."fila_unica" = true),
	CONSTRAINT "configuracion_retencion_positiva" CHECK ("configuracion_negocio"."minutos_retencion" > 0),
	CONSTRAINT "configuracion_horizonte_positivo" CHECK ("configuracion_negocio"."dias_horizonte" > 0),
	CONSTRAINT "configuracion_maximo_servicios" CHECK ("configuracion_negocio"."maximo_servicios_por_reserva" > 0),
	CONSTRAINT "configuracion_horas_no_negativas" CHECK (
        "configuracion_negocio"."horas_minimas_cancelacion" >= 0
        AND "configuracion_negocio"."horas_recordatorio_primero" >= 0
        AND ("configuracion_negocio"."horas_recordatorio_segundo" IS NULL OR "configuracion_negocio"."horas_recordatorio_segundo" >= 0)
      )
);
--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid,
	"accion" text NOT NULL,
	"entidad" text NOT NULL,
	"entidad_id" uuid,
	"datos_antes" jsonb,
	"datos_despues" jsonb,
	"direccion_ip" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "servicios_sucursales" ADD CONSTRAINT "servicios_sucursales_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicios_sucursales" ADD CONSTRAINT "servicios_sucursales_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profesionales" ADD CONSTRAINT "profesionales_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profesionales_servicios" ADD CONSTRAINT "profesionales_servicios_profesional_id_profesionales_id_fk" FOREIGN KEY ("profesional_id") REFERENCES "public"."profesionales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profesionales_servicios" ADD CONSTRAINT "profesionales_servicios_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profesionales_sucursales" ADD CONSTRAINT "profesionales_sucursales_profesional_id_profesionales_id_fk" FOREIGN KEY ("profesional_id") REFERENCES "public"."profesionales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profesionales_sucursales" ADD CONSTRAINT "profesionales_sucursales_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "excepciones_horario" ADD CONSTRAINT "excepciones_horario_profesional_id_profesionales_id_fk" FOREIGN KEY ("profesional_id") REFERENCES "public"."profesionales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "excepciones_horario" ADD CONSTRAINT "excepciones_horario_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horarios_semanales" ADD CONSTRAINT "horarios_semanales_profesional_id_profesionales_id_fk" FOREIGN KEY ("profesional_id") REFERENCES "public"."profesionales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horarios_semanales" ADD CONSTRAINT "horarios_semanales_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_creada_por_usuario_id_usuarios_id_fk" FOREIGN KEY ("creada_por_usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas_servicios" ADD CONSTRAINT "reservas_servicios_reserva_id_reservas_id_fk" FOREIGN KEY ("reserva_id") REFERENCES "public"."reservas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas_servicios" ADD CONSTRAINT "reservas_servicios_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas_servicios" ADD CONSTRAINT "reservas_servicios_profesional_id_profesionales_id_fk" FOREIGN KEY ("profesional_id") REFERENCES "public"."profesionales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_reserva_id_reservas_id_fk" FOREIGN KEY ("reserva_id") REFERENCES "public"."reservas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_registrado_por_usuario_id_usuarios_id_fk" FOREIGN KEY ("registrado_por_usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes_cambio" ADD CONSTRAINT "solicitudes_cambio_reserva_id_reservas_id_fk" FOREIGN KEY ("reserva_id") REFERENCES "public"."reservas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes_cambio" ADD CONSTRAINT "solicitudes_cambio_resuelta_por_usuario_id_usuarios_id_fk" FOREIGN KEY ("resuelta_por_usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_reserva_id_reservas_id_fk" FOREIGN KEY ("reserva_id") REFERENCES "public"."reservas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sesiones_hash_token_unico" ON "sesiones" USING btree ("hash_token");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_email_unico" ON "usuarios" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "excepciones_rango" ON "excepciones_horario" USING btree ("comienza_en","termina_en");--> statement-breakpoint
CREATE INDEX "excepciones_profesional" ON "excepciones_horario" USING btree ("profesional_id");--> statement-breakpoint
CREATE INDEX "horarios_profesional_dia" ON "horarios_semanales" USING btree ("profesional_id","dia_semana");--> statement-breakpoint
CREATE UNIQUE INDEX "reservas_hash_token_unico" ON "reservas" USING btree ("hash_token_gestion");--> statement-breakpoint
CREATE INDEX "reservas_sucursal_comienza" ON "reservas" USING btree ("sucursal_id","comienza_en");--> statement-breakpoint
CREATE INDEX "reservas_estado_retencion" ON "reservas" USING btree ("estado","retencion_expira_en");--> statement-breakpoint
CREATE UNIQUE INDEX "reservas_servicios_orden_unico" ON "reservas_servicios" USING btree ("reserva_id","orden");--> statement-breakpoint
CREATE INDEX "reservas_servicios_profesional_ocupacion" ON "reservas_servicios" USING btree ("profesional_id","ocupa_desde");--> statement-breakpoint
CREATE INDEX "reservas_servicios_reserva" ON "reservas_servicios" USING btree ("reserva_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pagos_id_externo_unico" ON "pagos" USING btree ("id_pago_externo") WHERE "pagos"."id_pago_externo" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "pagos_reserva" ON "pagos" USING btree ("reserva_id");--> statement-breakpoint
CREATE INDEX "pagos_referencia_externa" ON "pagos" USING btree ("referencia_externa");--> statement-breakpoint
CREATE INDEX "solicitudes_estado" ON "solicitudes_cambio" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "solicitudes_reserva" ON "solicitudes_cambio" USING btree ("reserva_id");--> statement-breakpoint
CREATE INDEX "notificaciones_pendientes" ON "notificaciones" USING btree ("estado","programada_para");--> statement-breakpoint
CREATE INDEX "notificaciones_reserva" ON "notificaciones" USING btree ("reserva_id");--> statement-breakpoint
CREATE UNIQUE INDEX "configuracion_fila_unica" ON "configuracion_negocio" USING btree ("fila_unica");--> statement-breakpoint
CREATE INDEX "auditoria_entidad" ON "auditoria" USING btree ("entidad","entidad_id");--> statement-breakpoint
CREATE INDEX "auditoria_usuario_fecha" ON "auditoria" USING btree ("usuario_id","creado_en");