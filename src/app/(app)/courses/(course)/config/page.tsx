'use client'
// src/app/(app)/courses/[courseId]/config/page.tsx
// Carga en el navegador curso, comisiones, permisos y el padrón de perfiles.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/session-context'
import PageLoading from '@/components/layout/PageLoading'
import ConfigClient from './ConfigClient'
import { useCourseId } from '@/lib/use-course'

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Data {
  courseId: string
  course: any
  commissions: any[]
  permissions: any[]
  allProfiles: any[]
}

export default function ConfigPage() {
  const courseId = useCourseId()
  const { profile } = useSession()
  const [supabase] = useState(() => createClient())
  const [data, setData] = useState<Data | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [courseRes, commsRes, permsRes, allProfilesRes] = await Promise.all([
        supabase.from('courses').select('*').eq('id', courseId).single(),
        supabase.from('commissions').select('*').eq('course_id', courseId),
        supabase.from('user_course_permissions')
          .select('id, user_id, commission_id, permission, profiles(full_name, global_role)')
          .eq('course_id', courseId),
        supabase.from('profiles').select('id, full_name, global_role').order('full_name'),
      ])
      if (cancelled) return
      setData({
        courseId,
        course: courseRes.data,
        commissions: commsRes.data || [],
        permissions: permsRes.data || [],
        allProfiles: allProfilesRes.data || [],
      })
    })()
    return () => { cancelled = true }
  }, [courseId, supabase])

  // Los datos traen el curso al que pertenecen, y la pantalla no se dibuja
  // hasta que ese curso es el de la URL.
  //
  // Sin esto, al cambiar de curso sin cambiar de sección el contenido quedaba
  // congelado en el curso anterior: el `key` se actualizaba antes que los
  // datos, así que el componente se volvía a montar con los datos viejos y,
  // cuando llegaban los nuevos, el key ya no cambiaba y useState(initial…) los
  // ignoraba. Había que irse a otra sección y volver para verlo bien.
  if (!data || data.courseId !== courseId) return <PageLoading />

  return (
    <ConfigClient
      key={courseId}
      courseId={courseId}
      profile={profile}
      initialCourse={data.course}
      initialCommissions={data.commissions}
      initialPermissions={data.permissions}
      initialAllProfiles={data.allProfiles}
    />
  )
}
