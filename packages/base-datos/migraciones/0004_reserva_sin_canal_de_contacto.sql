-- Un turno cargado a mano puede no tener por dónde avisar.
--
-- La regla anterior exigía canal de contacto en toda reserva activa. Vale para
-- la web, donde el formulario siempre lo pide, pero no para el mostrador: un
-- turno tomado por teléfono puede dejar sólo un nombre, y obligar a inventar un
-- número falso sería peor que aceptar que no lo hay.
--
-- Lo que sigue siendo obligatorio es lo que define que la reserva existe: el
-- nombre y la aceptación de las condiciones. La coherencia del canal la sigue
-- cuidando `reservas_contacto_coherente`: si se declara uno, tiene que tener su
-- dato cargado.
ALTER TABLE "reservas" DROP CONSTRAINT "reservas_datos_completos_si_esta_activa";--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_datos_completos_si_esta_activa" CHECK (
        "reservas"."estado" NOT IN ('confirmada', 'completada', 'ausente')
        OR (
          "reservas"."cliente_nombre" IS NOT NULL
          AND "reservas"."acepto_condiciones_en" IS NOT NULL
        )
      );
