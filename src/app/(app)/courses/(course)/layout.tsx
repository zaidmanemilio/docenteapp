'use client'
// src/app/(app)/courses/[courseId]/layout.tsx
//
// Verifica que el curso exista y sea accesible antes de mostrar sus pantallas.
//
// La comprobación ahora corre en el navegador, pero no es lo que protege los
// datos: de eso se ocupa la RLS en Postgres, que devuelve cero filas para un
// curso ajeno sin importar qué pida el cliente. Esto es para dar un mensaje
// claro en vez de una pantalla vacía.
import { useEffect, useState } from 'react'
import { useCourseId } from '@/lib/use-course'
import { createClient } from '@/lib/supabase/client'
import PageLoading from '@/components/layout/PageLoading'

export default function CourseLayout({ children }: { children: React.ReactNode }) {
  const courseId = useCourseId()
  const [supabase] = useState(() => createClient())
  const [state, setState] = useState<'checking' | 'ok' | 'denied'>('checking')

  useEffect(() => {
    let cancelled = false
    setState('checking')
    ;(async () => {
      // Si la RLS no deja verlo, esta consulta no devuelve nada.
      const { data } = await supabase
        .from('courses')
        .select('id')
        .eq('id', courseId)
        .maybeSingle()
      if (cancelled) return
      setState(data ? 'ok' : 'denied')
    })()
    return () => { cancelled = true }
  }, [courseId, supabase])

  if (state === 'checking') return <PageLoading />

  if (state === 'denied') {
    return (
      <div style={{ padding: '24px', color: 'var(--text-muted)' }}>
        Este curso no existe o no tenés acceso.
      </div>
    )
  }

  return <>{children}</>
}
