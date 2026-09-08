// Configuración de Next.js para la web pública y el panel.
import type { NextConfig } from 'next';

const configuracion: NextConfig = {
  reactStrictMode: true,
  // Los paquetes internos se compilan desde su fuente TypeScript.
  transpilePackages: ['@manly/interfaz', '@manly/contratos'],
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  eslint: {
    // El linteo corre como tarea propia de Turborepo, no dentro del build.
    ignoreDuringBuilds: true,
  },
};

export default configuracion;
