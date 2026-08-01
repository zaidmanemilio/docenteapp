'use client'
// src/app/(app)/courses/[courseId]/calendar/page.tsx
// Carga en el navegador. El permiso efectivo sobre el curso se calcula acá,
// así el componente ya sabe desde el primer pintado si puede editar.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/session-context'
import { effectiveCoursePermission } from '@/lib/permissions'
import PageLoading from '@/components/layout/PageLoading'
import CalendarClient from './CalendarClient'
import type { Commission } from '@/types'
import type { ExtendedSession } from '@/components/schedule/SessionModal'
import { useCourseId } from '@/lib/use-course'

interface Data {
  courseName: string
  zoomUrl: string
  coursePermission: string | null
  sessions: ExtendedSession[]
  commissions: Commission[]
}

export default function CalendarPage() {
  const courseId = useCourseId()
  const { profile } = useSession()
  const [supabase] = useState(() => createClient())
  const [data, setData] = useState<Data | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [courseRes, sessionsRes, commsRes, permRes] = await Promise.all([
        supabase.from('courses').select('name, zoom_url').eq('id', courseId).single(),
        supabase.from('sessions').select('*').eq('course_id', courseId).order('date').order('start_time'),
        supabase.from('commissions').select('id, name').eq('course_id', courseId),
        supabase.from('user_course_permissions').select('permission')
          .eq('user_id', profile.id).eq('course_id', courseId),
      ])
      if (cancelled) return
      setData({
        courseName: courseRes.data?.name || '',
        zoomUrl: courseRes.data?.zoom_url || '',
        coursePermission: effectiveCoursePermission(profile.global_role, permRes.data || []),
        sessions: (sessionsRes.data || []) as ExtendedSession[],
        commissions: commsRes.data || [],
      })
    })()
    return () => { cancelled = true }
  }, [courseId, supabase, profile.id, profile.global_role])

  if (!data) return <PageLoading />

  return (
    <CalendarClient
      key={courseId}
      courseId={courseId}
      courseName={data.courseName}
      zoomUrl={data.zoomUrl}
      coursePermission={data.coursePermission}
      initialSessions={data.sessions}
      initialCommissions={data.commissions}
    />
  )
}
