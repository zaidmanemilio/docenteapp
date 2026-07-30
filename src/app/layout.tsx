// src/app/layout.tsx
import type { Metadata, Viewport } from 'next'
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
