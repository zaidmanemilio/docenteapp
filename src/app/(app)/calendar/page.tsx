// src/app/(app)/calendar/page.tsx
// Server component del calendario unificado.
//
// Era la pantalla más lenta de todas: en el cliente encadenaba cuatro viajes
// uno atrás del otro (getUser → perfil → cursos → encuentros), más un quinto
// re-fetch de cursos que existía solo para esquivar un closure viejo. Todo eso
// recién arrancaba después de hidratar. Acá se resuelve en el servidor y el
// re-fetch redundante desaparece.
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/supabase/session'
import UnifiedCalendarClient from './UnifiedCalendarClient'

const SESSION_COLS =
  'id, course_id, date, class_number, title, type, responsible, modality, status, start_time, end_time, location'

export default async function UnifiedCalendarPage() {
  const profile = await requireProfile()
  const supabase = await createClient()

  // Cursos accesibles (mismo criterio que traía el cliente).
  let courses: { id: string; name: string }[] = []
  if (profile.global_role === 'admin') {
    const { data } = await supabase
      .from('courses').select('id, name').not('status', 'eq', 'archived')
    courses = data || []
  } else {
    const { data: perms } = await supabase
      .from('user_course_permissions').select('course_id').eq('user_id', profile.id)
    const courseIds = Array.from(new Set((perms || []).map(p => p.course_id)))
    if (courseIds.length > 0) {
      const { data } = await supabase
        .from('courses').select('id, name').in('id', courseIds).not('status', 'eq', 'archived')
      courses = data || []
    }
  }

  const courseIds = courses.map(c => c.id)
  let sessions: Record<string, unknown>[] = []
  if (courseIds.length > 0) {
    const { data } = await supabase
      .from('sessions').select(SESSION_COLS)
      .in('course_id', courseIds)
      .order('date').order('start_time')
    sessions = data || []
  }

  const byId = new Map(courses.map(c => [c.id, c]))
  const enriched = sessions.map(s => {
    const cid = s.course_id as string
    return { ...s, course: byId.get(cid) || { id: cid, name: 'Curso' } }
  })

  /* eslint-disable @typescript-eslint/no-explicit-any */
  return <UnifiedCalendarClient initialSessions={enriched as any} initialCourses={courses} />
}
