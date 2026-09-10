// Punto de entrada del paquete.
//
// Sólo exporta la política de limpieza. La inicialización del SDK vive en cada
// aplicación, porque la web usa `@sentry/nextjs` y la API y el worker usan
// `@sentry/node`, que son SDK distintos con arranques distintos.
export * from './limpieza';
