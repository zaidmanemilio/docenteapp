// src/app/(app)/courses/[courseId]/users/page.tsx
// Server component: precarga el padrón de perfiles, las comisiones y los
// permisos del curso. El cliente mantiene el alta de usuarios, la importación
// y la asignación de permisos.
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/supabase/session'
import UsersClient from './UsersClient'

export default async function UsersPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params
  const profile = await requireProfile()
  const supabase = await createClient()

  const [allProfilesRes, commsRes, permsRes] = await Promise.all([
    supabase.from('profiles').select('*').order('full_name'),
    supabase.from('commissions').select('*').eq('course_id', courseId),
    supabase.from('user_course_permissions').select('*, profiles(*)').eq('course_id', courseId),
  ])

  /* eslint-disable @typescript-eslint/no-explicit-any */
  return (
    <UsersClient
      courseId={courseId}
      myProfile={profile}
      initialAllProfiles={allProfilesRes.data || []}
      initialCommissions={commsRes.data || []}
      initialPermissions={(permsRes.data || []) as any}
    />
  )
}
