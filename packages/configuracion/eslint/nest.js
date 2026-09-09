// Configuración ESLint para la API NestJS: habilita metadatos de decoradores.
import base from './base.js';

export default [
  ...base,
  {
    files: ['**/*.ts'],
    rules: {
      // Los decoradores de Nest requieren tipos de parámetro que el linter marca como no usados.
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',

      // Incompatible con emitDecoratorMetadata: si el import de una clase que
      // se inyecta por constructor pasa a ser `import type`, desaparece en
      // tiempo de ejecución y Nest deja de poder resolver la dependencia.
      // El arreglo automático de esta regla ya rompió el arranque una vez.
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];
