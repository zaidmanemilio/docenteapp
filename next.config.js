/** @type {import('next').NextConfig} */
const nextConfig = {
  // Genera HTML/CSS/JS estático en la carpeta out/, sin servidor Node.
  // Es lo que permite subir la app a Hostinger como archivos.
  output: 'export',

  // Cada ruta se emite como carpeta con su index.html (/courses/dashboard/
  // -> /courses/dashboard/index.html). Es lo que Apache sirve por defecto al
  // pedir un directorio, así no hacen falta reglas de reescritura.
  trailingSlash: true,

  reactStrictMode: true,
  typescript: {
    // Durante el MVP, ignoramos errores de tipos en el build.
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
}

module.exports = nextConfig
