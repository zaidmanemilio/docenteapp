'use client'
// src/components/layout/ThemeToggle.tsx
//
// El botón de claro / oscuro de la barra superior.
import { useEffect, useState } from 'react'
import { aplicarTema, temaActual, type Theme } from '@/lib/theme'

export default function ThemeToggle() {
  // Arranca en null y no en 'dark': el valor real está en localStorage, que
  // en el servidor no existe. Pintar un ícono antes de saberlo haría que el
  // botón cambie solo apenas hidrata.
  const [tema, setTema] = useState<Theme | null>(null)

  useEffect(() => { setTema(temaActual()) }, [])

  function alternar() {
    const siguiente: Theme = tema === 'light' ? 'dark' : 'light'
    setTema(siguiente)
    aplicarTema(siguiente)
  }

  const esClaro = tema === 'light'

  return (
    <button
      className="icon-btn"
      onClick={alternar}
      title={esClaro ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'}
      aria-label={esClaro ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'}
    >
      {/* Mientras no se sabe el tema, el hueco se reserva igual para que la
          barra no salte al hidratar. */}
      <i
        className={tema === null ? 'ti ti-circle-dashed' : esClaro ? 'ti ti-moon' : 'ti ti-sun'}
        style={{ opacity: tema === null ? 0 : 1 }}
        aria-hidden="true"
      ></i>
    </button>
  )
}
