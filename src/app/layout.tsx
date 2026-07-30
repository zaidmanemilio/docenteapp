// src/app/layout.tsx
import type { Metadata, Viewport } from 'next'
// Los íconos se sirven desde el propio dominio (paquete npm), no desde un CDN.
// Antes cada pantalla inyectaba su propio <link> a jsdelivr: hasta que esa
// hoja externa cargaba, los botones con solo ícono se veían como cuadrados
// vacíos, y si el CDN fallaba no aparecían nunca. Importado acá una sola vez
// forma parte del bundle y siempre está disponible al pintar.
import '@tabler/icons-webfont/dist/tabler-icons.min.css'
import '../styles/globals.css'

export const metadata: Metadata = {
  title: 'DocenteApp — Gestión docente universitaria',
  description: 'Plataforma interna de planificación y seguimiento docente',
}

// Sin esto, un celular renderiza la página con ancho de escritorio y la
// achica entera (todo queda ilegible). Es la base de todo lo responsive.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-theme="dark">
      <body>{children}</body>
    </html>
  )
}
