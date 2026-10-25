'use client'
// src/app/(app)/courses/[courseId]/users/page.tsx
// Carga en el navegador el padrón de perfiles, las comisiones y los permisos.
import { useEffect, useState } from 'react'
import { useCourseId } from '@/lib/use-course'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/session-context'
import PageLoading from '@/components/layout/PageLoading'
import UsersClient from './UsersClient'

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Data {
  courseId: string
  allProfiles: any[]
  commissions: any[]
  permissions: any[]
}

export default function UsersPage() {
  const courseId = useCourseId()
  const { profile } = useSession()
  const [supabase] = useState(() => createClient())
  const [data, setData] = useState<Data | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [allProfilesRes, commsRes, permsRes] = await Promise.all([
        supabase.from('profiles').select('*').order('full_name'),
        supabase.from('commissions').select('*').eq('course_id', courseId),
        supabase.from('user_course_permissions').select('*, profiles(*)').eq('course_id', courseId),
      ])
      if (cancelled) return
      setData({
        courseId,
        allProfiles: allProfilesRes.data || [],
        commissions: commsRes.data || [],
        permissions: permsRes.data || [],
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
    <UsersClient
      key={courseId}
      courseId={courseId}
      myProfile={profile}
      initialAllProfiles={data.allProfiles}
      initialCommissions={data.commissions}
      initialPermissions={data.permissions}
    />
  )
}
