# Reglas de negocio

Resumen operativo de las reglas que el sistema debe garantizar. Los valores
marcados como configurables se editan desde el panel, no en el código.

## Reserva

- Entre 1 y 4 servicios por reserva (máximo inicial configurable).
- Una única sucursal por reserva.
- Los bloques son consecutivos, sin tiempos muertos entre servicios.
- Cada servicio puede tener un profesional específico o "cualquiera".
- Una misma reserva puede repartir sus servicios entre profesionales distintos.
- El cliente ve la secuencia exacta antes de confirmar.
- No hace falta crear una cuenta.

## Contacto

- Nombre obligatorio.
- Un canal obligatorio: WhatsApp o email.
- Aceptación explícita de condiciones y de las notificaciones del turno.

> **Pendiente de definición.** El plan pide un canal de respaldo cuando el
> primario falla, pero también dice "nunca ambos". Si sólo se guarda un canal, no
> hay respaldo posible. Hay que decidir si el segundo dato es opcional antes de
> implementar la Fase 7.

## Estados

`pendiente_pago` → `confirmada` → `completada` / `ausente`

Salidas alternativas: `cancelada` (por cliente o gerencia) y `expirada` (la
retención venció sin pago aprobado).

## Retención y pago

- Una selección retiene todos sus bloques por **10 minutos**.
- Si el pago no se aprueba dentro del plazo, la reserva expira y libera los horarios.
- La seña se cobra con Mercado Pago Checkout Pro.
- La confirmación depende del **webhook verificado**, no del retorno del navegador.
- En reservas multiservicio la seña es la suma de las reglas de cada servicio.
- El precio y las condiciones se copian como snapshot: cambiar un precio después
  no altera reservas ya creadas.
- El saldo restante se registra desde el panel (efectivo, QR u otro medio manual).
- Manly no almacena datos de tarjeta.

## Seña por servicio

Cada servicio define su modalidad: `deshabilitada`, `fija` o `porcentual`.

## Cambios y cancelaciones

- Regla global predeterminada: **24 horas** de anticipación.
- Gerencia puede cambiarla globalmente y sobrescribirla por sucursal o servicio.
- Con anticipación suficiente: cancelación y reprogramación **automáticas**.
- Dentro del plazo: se crea una **solicitud** para gerencia y el horario original
  sigue ocupado hasta que se resuelva.
- Una reprogramación automática conserva la seña y reemplaza todos los bloques de
  forma atómica: o entran todos, o no entra ninguno.
- Una cancelación con seña genera una tarea para gerencia.
- **Ningún reintegro es automático.** Siempre requiere una acción explícita de
  gerencia, confirmada.

## Notificaciones

- Confirmación inmediata por el canal elegido.
- Recordatorio 24 horas antes (configurable).
- Segundo recordatorio 2 horas antes (configurable).
- Aviso de cancelación, aprobación, rechazo o reprogramación.
- Salen de una bandeja persistente con reintentos.
- Si un canal falla y hay otro dato autorizado, se usa como respaldo; si no, se
  alerta a gerencia.

## Permisos

| Acción                                 | Gerencia | Profesional |
| -------------------------------------- | :------: | :---------: |
| Ver agenda propia                      |    Sí    |     Sí      |
| Ver agenda de toda la sucursal         |    Sí    |     No      |
| Bloquear disponibilidad propia         |    Sí    |     Sí      |
| Marcar completado / ausente            |    Sí    |     Sí      |
| ABM de servicios, sucursales, horarios |    Sí    |     No      |
| Precios y reglas de seña               |    Sí    |     No      |
| Aprobar solicitudes tardías            |    Sí    |     No      |
| Registrar pagos y reintegros           |    Sí    |     No      |
| Invitar usuarios y asignar permisos    |    Sí    |     No      |
| Ver auditoría                          |    Sí    |     No      |

## Horizonte y zona horaria

- Disponibilidad visible: **60 días** hacia adelante (configurable).
- Las fechas se guardan en UTC y se muestran en `America/Argentina/Buenos_Aires`.
