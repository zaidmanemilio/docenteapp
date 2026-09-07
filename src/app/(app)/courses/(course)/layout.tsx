'use client'
// src/app/(app)/courses/(course)/layout.tsx
//
// Comprueba que el curso exista y sea accesible, PERO sin bloquear el render.
//
// Antes este chequeo era un await que frenaba todo: la pantalla no podía
// empezar a pedir sus datos hasta que volviera. Eran dos viajes en serie a
// Supabase (~209 ms cada uno desde Europa) para responder dos veces la misma
// pregunta, porque la RLS ya devuelve cero filas de un curso ajeno.
//
// Ahora las dos consultas salen en paralelo: la pantalla pide sus datos de
// entrada y este chequeo corre al lado. Solo si falla se reemplaza el
// contenido por el aviso. En el caso normal no cuesta nada.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCourseId } from '@/lib/use-course'

export default function CourseLayout({ children }: { children: React.ReactNode }) {
  const courseId = useCourseId()
  const [supabase] = useState(() => createClient())
  const [denegado, setDenegado] = useState(false)

  useEffect(() => {
    let cancelado = false
    setDenegado(false)
    if (!courseId) return
    ;(async () => {
      const { data } = await supabase
        .from('courses')
        .select('id')
        .eq('id', courseId)
        .maybeSingle()
      if (!cancelado && !data) setDenegado(true)
    })()
    return () => { cancelado = true }
  }, [courseId, supabase])

  if (!courseId) {
    return (
      <div style={{ padding: '24px', color: 'var(--text-muted)' }}>
        No hay ningún curso seleccionado. Elegí uno en el panel de la izquierda.
      </div>
    )
  }

  if (denegado) {
    return (
      <div style={{ padding: '24px', color: 'var(--text-muted)' }}>
        Este curso no existe, fue archivado o no tenés acceso.
      </div>
    )
  }

  return <>{children}</>
}
