'use client'
// src/app/(app)/courses/[courseId]/schedule/page.tsx
// Carga en el navegador. Las 5 consultas salen en paralelo, no encadenadas.
import { useEffect, useState } from 'react'
import { useCourseId } from '@/lib/use-course'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/session-context'
import { effectiveCoursePermission } from '@/lib/permissions'
import PageLoading from '@/components/layout/PageLoading'
import ScheduleClient from './ScheduleClient'
import type { Commission } from '@/types'
import type { ExtendedSession } from '@/components/schedule/SessionModal'

interface Data {
  courseName: string
  zoomUrl: string
  coursePermission: string | null
  sessions: ExtendedSession[]
  commissions: Commission[]
  courseTeachers: string[]
}

export default function SchedulePage() {
  const courseId = useCourseId()
  const { profile } = useSession()
  const [supabase] = useState(() => createClient())
  const [data, setData] = useState<Data | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [courseRes, sessionsRes, commissionsRes, permRes, courseTeachersRes] = await Promise.all([
        supabase.from('courses').select('name, zoom_url').eq('id', courseId).single(),
        supabase.from('sessions').select('*').eq('course_id', courseId).order('date').order('class_number'),
        supabase.from('commissions').select('*').eq('course_id', courseId),
        supabase.from('user_course_permissions').select('permission')
          .eq('user_id', profile.id).eq('course_id', courseId),
        // Docentes del curso, para el desplegable de Responsable
        supabase.from('user_course_permissions').select('profiles(full_name)').eq('course_id', courseId),
      ])
      if (cancelled) return

      const teacherNames = (courseTeachersRes.data || [])
        .map((r: { profiles: { full_name?: string } | { full_name?: string }[] | null }) => {
          const prof = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
          return prof?.full_name || ''
        })
        .filter(Boolean)

      setData({
        courseName: courseRes.data?.name || '',
        zoomUrl: courseRes.data?.zoom_url || '',
        coursePermission: effectiveCoursePermission(profile.global_role, permRes.data || []),
        sessions: (sessionsRes.data || []) as ExtendedSession[],
        commissions: commissionsRes.data || [],
        courseTeachers: Array.from(new Set(teacherNames)).sort(),
      })
    })()
    return () => { cancelled = true }
  }, [courseId, supabase, profile.id, profile.global_role])

  if (!data) return <PageLoading />

  return (
    <ScheduleClient
      key={courseId}
      courseId={courseId}
      courseName={data.courseName}
      zoomUrl={data.zoomUrl}
      profile={profile}
      coursePermission={data.coursePermission}
      initialSessions={data.sessions}
      initialCommissions={data.commissions}
      initialCourseTeachers={data.courseTeachers}
    />
  )
}
