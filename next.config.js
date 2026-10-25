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

  // El build vuelve a fallar ante un error de tipos.
  //
  // Estuvo en `ignoreBuildErrors: true` desde el MVP por seis errores que
  // nadie había arreglado. El precio lo pagamos una vez: una edición rompió
  // una cadena de métodos (`.filter(...).length.sort(...)`), el build pasó
  // igual porque la bandera lo tapaba, y la pantalla de Cronograma se cayó
  // en producción con "Application error". tsc lo habría atajado.
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
}

module.exports = nextConfig
