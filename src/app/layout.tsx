// src/app/layout.tsx
import type { Metadata, Viewport } from 'next'
import { DM_Sans } from 'next/font/google'
// Los íconos se sirven desde el propio dominio (paquete npm), no desde un CDN.
// Antes cada pantalla inyectaba su propio <link> a jsdelivr: hasta que esa
// hoja externa cargaba, los botones con solo ícono se veían como cuadrados
// vacíos, y si el CDN fallaba no aparecían nunca. Importado acá una sola vez
// forma parte del bundle y siempre está disponible al pintar.
import '@tabler/icons-webfont/dist/tabler-icons.min.css'
import '../styles/globals.css'

// La tipografía se auto-hospeda en el build en lugar de pedirla a Google en
// tiempo de ejecución. Antes globals.css tenía un @import a fonts.googleapis:
// el navegador bajaba el CSS, y recién ahí descubría que faltaba la fuente
// (dos viajes encadenados a un tercero, bloqueando el pintado).
//
// Pesos: solo los que la app realmente usa. El 700 se usa en varias pantallas
// pero no estaba en el @import anterior, así que el navegador lo falsificaba
// engrosando el 600; ahora es el peso real. Se dejaron fuera el 300, la
// cursiva y toda DM Mono, que se descargaban sin que nada los usara.
const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-dm-sans',
})

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
    <html lang="es" data-theme="dark" className={dmSans.variable}>
      <body>{children}</body>
    </html>
  )
}
