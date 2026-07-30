// src/app/(app)/courses/[courseId]/config/page.tsx
// Server component: precarga curso, comisiones, permisos y el padrón de
// perfiles. El cliente conserva el formulario y las altas/bajas de permisos.
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/supabase/session'
import ConfigClient from './ConfigClient'

export default async function ConfigPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params
  const profile = await requireProfile()
  const supabase = await createClient()

  const [courseRes, commsRes, permsRes, allProfilesRes] = await Promise.all([
    supabase.from('courses').select('*').eq('id', courseId).single(),
    supabase.from('commissions').select('*').eq('course_id', courseId),
    supabase.from('user_course_permissions')
      .select('id, user_id, commission_id, permission, profiles(full_name, global_role)')
      .eq('course_id', courseId),
    supabase.from('profiles').select('id, full_name, global_role').order('full_name'),
  ])

  /* eslint-disable @typescript-eslint/no-explicit-any */
  return (
    <ConfigClient
      courseId={courseId}
      profile={profile}
      initialCourse={courseRes.data as any}
      initialCommissions={commsRes.data || []}
      initialPermissions={(permsRes.data || []) as any}
      initialAllProfiles={(allProfilesRes.data || []) as any}
    />
  )
}
