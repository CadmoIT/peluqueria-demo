// Completa el entorno mínimo para el arranque en memoria.
//
// Se importa antes que `app.module` a propósito: la validación de entorno corre
// al cargar ese módulo y exige una cadena de conexión, aunque en este modo la
// conexión real se reemplace después por la base en memoria.
process.env.DATABASE_URL ??= 'postgresql://memoria/memoria';
process.env.NODE_ENV ??= 'development';
