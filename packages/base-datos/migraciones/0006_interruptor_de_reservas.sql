-- Interruptor de reservas online.
--
-- Para el día del corte y para el día que algo salga mal. Apagarlo no toca lo
-- ya reservado: los turnos siguen, el enlace de gestión sigue funcionando y el
-- panel sigue pudiendo cargar a mano. Sólo deja de tomarse turnos nuevos desde
-- la web, que es lo que se quiere poder frenar sin desplegar nada.
ALTER TABLE "configuracion_negocio"
  ADD COLUMN IF NOT EXISTS "reservas_online_activas" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "configuracion_negocio"
  ADD COLUMN IF NOT EXISTS "mensaje_reservas_cerradas" text;
