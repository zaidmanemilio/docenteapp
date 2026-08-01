'use client'
// src/app/(app)/calendar/page.tsx
// Calendario unificado: los encuentros de todos los cursos accesibles.
// La lista de cursos sale del SessionProvider, así que acá solo falta traer
// los encuentros: una consulta en vez de la cadena que había antes.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/session-context'
import PageLoading from '@/components/layout/PageLoading'
import UnifiedCalendarClient from './UnifiedCalendarClient'

const SESSION_COLS =
  'id, course_id, date, class_number, title, type, responsible, modality, status, start_time, end_time, location'

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function UnifiedCalendarPage() {
  const { courses } = useSession()
  const [supabase] = useState(() => createClient())
  const [sessions, setSessions] = useState<any[] | null>(null)

  const courseIds = courses.map(c => c.id).join(',')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const ids = courseIds ? courseIds.split(',') : []
      if (ids.length === 0) {
        if (!cancelled) setSessions([])
        return
      }
      const { data } = await supabase
        .from('sessions').select(SESSION_COLS)
        .in('course_id', ids)
        .order('date').order('start_time')
      if (cancelled) return

      const byId = new Map(courses.map(c => [c.id, c]))
      setSessions((data || []).map(s => {
        const cid = s.course_id as string
        return { ...s, course: byId.get(cid) || { id: cid, name: 'Curso' } }
      }))
    })()
    return () => { cancelled = true }
    // courses se serializa en courseIds para no re-disparar por identidad.
  }, [courseIds, supabase]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!sessions) return <PageLoading />

  return (
    <UnifiedCalendarClient
      initialSessions={sessions as any}
      initialCourses={courses as any}
    />
  )
}
