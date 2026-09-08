// Carga los datos iniciales mínimos para desarrollo local.
// Según el plan no se importa nada de AgendaPro: las sucursales, servicios y
// profesionales reales se cargan desde el panel.
async function principal(): Promise<void> {
  console.warn('Sin semillas definidas todavía. Se completan en la Fase 3.');
}

principal().catch((error: unknown) => {
  console.error('Fallo al cargar las semillas:', error);
  process.exit(1);
});
