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
    },
  },
];
