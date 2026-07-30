// src/app/(app)/courses/[courseId]/calendar/page.tsx
// Server component: trae los datos antes de mandar el HTML. El permiso
// efectivo sobre el curso también se resuelve acá, así el cliente ya sabe
// desde el primer pintado si puede editar (antes aparecía en blanco hasta
// que respondía la consulta de permisos).
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/supabase/session'
import { effectiveCoursePermission } from '@/lib/permissions'
import CalendarClient from './CalendarClient'

export default async function CalendarPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params
  const profile = await requireProfile()
  const supabase = await createClient()

  const [courseRes, sessionsRes, commsRes, permRes] = await Promise.all([
    supabase.from('courses').select('name, zoom_url').eq('id', courseId).single(),
    supabase.from('sessions').select('*').eq('course_id', courseId).order('date').order('start_time'),
    supabase.from('commissions').select('id, name').eq('course_id', courseId),
    supabase.from('user_course_permissions').select('permission')
      .eq('user_id', profile.id).eq('course_id', courseId),
  ])

  return (
    <CalendarClient
      courseId={courseId}
      courseName={courseRes.data?.name || ''}
      zoomUrl={courseRes.data?.zoom_url || ''}
      coursePermission={effectiveCoursePermission(profile.global_role, permRes.data || [])}
      initialSessions={sessionsRes.data || []}
      initialCommissions={commsRes.data || []}
    />
  )
}
