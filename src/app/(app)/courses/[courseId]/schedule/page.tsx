// src/app/(app)/courses/[courseId]/schedule/page.tsx
// Server component: el cronograma es la pantalla más usada y la que más
// consultas encadenaba (6 en el cliente, después de un getUser). Ahora salen
// todas en paralelo en el servidor y el HTML llega con la tabla ya armada.
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/supabase/session'
import { effectiveCoursePermission } from '@/lib/permissions'
import ScheduleClient from './ScheduleClient'

export default async function SchedulePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params
  const profile = await requireProfile()
  const supabase = await createClient()

  const [courseRes, sessionsRes, commissionsRes, permRes, courseTeachersRes] = await Promise.all([
    supabase.from('courses').select('name, zoom_url').eq('id', courseId).single(),
    supabase.from('sessions').select('*').eq('course_id', courseId).order('date').order('class_number'),
    supabase.from('commissions').select('*').eq('course_id', courseId),
    supabase.from('user_course_permissions').select('permission')
      .eq('user_id', profile.id).eq('course_id', courseId),
    // Docentes del curso, para el desplegable de Responsable
    supabase.from('user_course_permissions').select('profiles(full_name)').eq('course_id', courseId),
  ])

  // Nombres de docentes del curso, sin duplicados, ordenados.
  const teacherNames = (courseTeachersRes.data || [])
    .map((r: { profiles: { full_name?: string } | { full_name?: string }[] | null }) => {
      const prof = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
      return prof?.full_name || ''
    })
    .filter(Boolean)

  return (
    <ScheduleClient
      courseId={courseId}
      courseName={courseRes.data?.name || ''}
      zoomUrl={courseRes.data?.zoom_url || ''}
      profile={profile}
      coursePermission={effectiveCoursePermission(profile.global_role, permRes.data || [])}
      initialSessions={sessionsRes.data || []}
      initialCommissions={commissionsRes.data || []}
      initialCourseTeachers={Array.from(new Set(teacherNames)).sort()}
    />
  )
}
