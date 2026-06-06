// src/app/layout.tsx
import type { Metadata } from 'next'
import '../styles/globals.css'

export const metadata: Metadata = {
  title: 'DocenteApp — Gestión docente universitaria',
  description: 'Plataforma interna de planificación y seguimiento docente',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
