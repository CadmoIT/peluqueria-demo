// Configuración ESLint para la aplicación web Next.js.
import base from './base.js';

export default [
  ...base,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  },
];
