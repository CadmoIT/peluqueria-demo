# Lanzamiento

Cómo se pasa de "el sistema anda en mi máquina" a "Manly toma turnos acá".

El orden importa: cada tramo depende de que el anterior esté cerrado, y varios
tienen esperas que no dependen de nosotros. Las aprobaciones de Meta son el
tramo más largo y el que conviene empezar primero.

## Lo que hace falta y no está en el repositorio

Nada de esto se puede resolver escribiendo código. Hasta que llegue, el sistema
funciona entero contra adaptadores simulados: el flujo se recorre igual, pero no
se cobra ni sale un solo mensaje.

| Qué                             | Para qué                       | Quién lo consigue | Demora típica |
| ------------------------------- | ------------------------------ | ----------------- | ------------- |
| Credenciales sandbox de MP      | Probar el cobro de la seña     | Manly             | Horas         |
| Credenciales de producción MP   | Cobrar de verdad               | Manly             | Días          |
| Cuenta de WhatsApp Business     | Mandar avisos por WhatsApp     | Manly             | Días          |
| Aprobación de las 7 plantillas  | Que los avisos salgan          | Meta              | **Semanas**   |
| Dominio verificado en Resend    | Mandar avisos por correo       | Manly             | Horas         |
| Dominio del sitio               | Publicar                       | Manly             | —             |
| Proyecto en Sentry              | Enterarse de los errores       | Manly             | Minutos       |
| Fotos de fachada y equipo       | Sacar los respaldos del sitio  | Manly             | —             |
| Direcciones, teléfonos, precios | Reemplazar los de demostración | Manly             | —             |

**Empezar por las plantillas de WhatsApp.** Están al final de este documento,
listas para pegar en el administrador de Meta. Mientras se aprueban, todo lo
demás se puede hacer en paralelo.

## 1. Staging

Un entorno igual a producción pero con credenciales de prueba. Sirve para
equivocarse sin consecuencias.

1. Rama de base de datos en Neon, separada de la de producción.
2. API y worker en Railway, web en Vercel. Ver [despliegue.md](despliegue.md).
3. Variables: las mismas que producción pero con `MP_ACCESS_TOKEN` empezando en
   `TEST-`. Con eso Mercado Pago usa el sandbox y las tarjetas de prueba.
4. Migraciones y semillas mínimas: sucursales, servicios y profesionales reales,
   sin los datos de demostración.
5. Crear el primer acceso al panel:

   ```bash
   pnpm --filter @manly/backend invitar -- alguien@manly.ar "Nombre" gerencia
   ```

6. Cargar horarios de cada profesional desde `Panel → Horarios`.

### Verificar que quedó bien

```bash
pnpm --filter @manly/backend verificar -- https://api-staging.manly.com.ar/api/v1
```

Recorre el flujo completo —catálogo, disponibilidad, retención, choque de
horarios, confirmación, enlace de gestión, enlace de pago, cancelación— y dice
en qué paso se cayó. Deja la agenda como la encontró.

Lo que el script **no** puede hacer es pagar: el checkout es una pantalla de
Mercado Pago. Ese tramo se prueba a mano con las
[tarjetas de prueba](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/additional-content/test-cards),
y hay que verificar los cuatro casos: aprobado, pendiente, rechazado y abandono
sin pagar.

Después, `Panel → Estado`. Todo tiene que estar en verde. Si algo dice
`SIMULADO`, falta una credencial.

## 2. Piloto interno

Antes de que entre un cliente real. Una sucursal por vez, con el equipo usando
el panel de verdad durante su jornada.

**Por sucursal, sobre staging:**

- Cargar tres turnos a mano desde el mostrador, uno sin teléfono.
- Reservar tres desde el sitio, como si fuera un cliente: uno simple, uno con
  dos servicios encadenados, uno eligiendo profesional.
- Cancelar uno con anticipación y otro sobre la hora, para que caiga como
  solicitud y gerencia la resuelva.
- Reprogramar uno.
- Marcar uno como completado y otro como ausente.
- Cobrar uno en efectivo y hacer un reintegro.
- Bloquear una franja y comprobar que deja de ofrecerse.

**Qué mirar, que es lo que el software no puede saber solo:**

- ¿Los tiempos de cada servicio son los reales? Si el corte lleva una hora y
  está cargado en 45 minutos, la agenda se atrasa todos los días.
- ¿Los buffers de preparación y limpieza alcanzan?
- ¿Los textos de los avisos suenan a Manly o suenan a sistema?
- ¿La anticipación de 24 horas para cancelar es la que quieren?
- ¿Falta algo en el panel que hoy se resuelve en un cuaderno?

Lo que salga de acá se corrige antes del corte, no después.

## 3. Corte

AgendaPro **no se integra ni se migra**. Los turnos anteriores al corte los
resuelve Manly operativamente, con lo que ya tiene cargado allá.

Secuencia, en este orden:

1. **Elegir la fecha.** Un día de poco movimiento, con el equipo avisado.
2. **Dejar de tomar turnos nuevos en AgendaPro**, con la anticipación suficiente
   para que no quede nada tomado más allá del corte.
3. Desplegar producción con las credenciales reales. La API **no arranca** si
   falta alguna: ver [seguridad.md](seguridad.md).
4. Correr `verificar` contra producción y revisar `Panel → Estado`.
5. **Recién ahí**, activar los enlaces de reserva: redes, Google, cartelería.
6. Los turnos que quedaron en AgendaPro se atienden como siempre. Si alguno
   necesita cambiarse, se carga a mano en el panel nuevo.

### Si algo sale mal

`Panel → Ajustes` tiene un interruptor para dejar de tomar reservas online. No
toca nada de lo ya reservado: los turnos siguen, el enlace de gestión de cada
cliente sigue funcionando y desde el panel se pueden seguir cargando a mano. Lo
único que se apaga es la toma de turnos nuevos desde la web, con el mensaje que
se configure.

Es preferible a bajar el sitio: bajarlo deja además sin poder moverse a quien ya
tiene turno.

## 4. Las primeras dos semanas

Lo que hay que mirar todos los días, y dónde:

| Qué                           | Dónde                 | Qué es normal            |
| ----------------------------- | --------------------- | ------------------------ |
| Estado general                | `Panel → Estado`      | Todo en verde            |
| Avisos que no llegaron        | `Panel → Avisos`      | Vacío                    |
| Solicitudes sin resolver      | `Panel → Solicitudes` | Ninguna de más de un día |
| Turnos con seña sin acreditar | `Panel → Estado`      | Bajando solo             |
| Errores de la API y la web    | Sentry                | Ninguno nuevo            |
| Errores del proceso de fondo  | Sentry, etiqueta cola | Ninguno nuevo            |

La pantalla de estado se refresca sola cada 30 segundos: se puede dejar abierta.

**El fallo silencioso a vigilar** es el de las notificaciones. Que un aviso no
salga no rompe nada: el turno queda igual, el panel se ve igual, y el problema
aparece recién cuando alguien no se presenta porque nunca supo que su turno había
cambiado. Por eso `Avisos` está en el menú y no escondido en un log.

## Apéndice: las 7 plantillas de WhatsApp

Se cargan en el administrador de WhatsApp Business de Meta. **El orden de los
parámetros es contrato**: si se reordenan en Meta hay que reordenarlos también en
`apps/worker/src/notificaciones/plantillas.ts`, o los mensajes salen con los
datos cambiados de lugar.

Categoría: `UTILITY` en todas. Idioma: `es_AR`.

Para verlas, ya con los `{{n}}` en su lugar y con qué va en cada uno:

```bash
pnpm --filter @manly/worker plantillas
```

Se derivan del código, no están copiadas: `plantillas.ts` es la única fuente. Si
alguien cambia un texto ahí, el comando lo refleja y no hay dos versiones que
puedan desincronizarse.

Cuidado con una trampa de WhatsApp: **sólo llega lo que va como parámetro**. Un
dato escrito en el cuerpo que no esté numerado no se manda. Pasó con la
dirección de la sucursal, que salía por correo y no por WhatsApp; hay una prueba
que ahora lo impide, pero conviene saberlo al editar un texto.

Mientras Meta no las apruebe, el worker usa el canal simulado y `Panel → Estado`
lo muestra como `SIMULADO`. El correo no depende de esa aprobación: se puede
lanzar con avisos por correo y sumar WhatsApp cuando salga.
