'use client'
// src/lib/use-escape.ts
//
// Cerrar con Escape. Lo esperaba cualquiera que abra un diálogo, y de los
// siete modales de la app solo lo tenía uno (el de confirmaciones).
//
// Se registra en document y no en el panel: el foco puede estar en un campo
// de adentro, en un botón, o en ningún lado si entraste con el mouse, y en
// todos esos casos Escape tiene que funcionar igual.
import { useEffect } from 'react'

/**
 * Llama a `alCerrar` cuando se aprieta Escape.
 * `activo` permite no escuchar mientras el modal está cerrado, o mientras
 * hay una operación en curso que no conviene interrumpir.
 */
export function useEscape(alCerrar: () => void, activo = true) {
  useEffect(() => {
    if (!activo) return
    function alTeclear(e: KeyboardEvent) {
      if (e.key === 'Escape') alCerrar()
    }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [alCerrar, activo])
}
