// src/app/(app)/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/supabase/session'

export default async function HomePage() {
  // Deduplicado por request: comparte usuario+perfil con el app-layout.
  const profile = await requireProfile()
  const supabase = await createClient()

  let firstCourseId: string | null = null

  if (profile.global_role === 'admin') {
    const { data } = await supabase.from('courses').select('id').order('name').limit(1)
    firstCourseId = data?.[0]?.id || null
  } else {
    const { data } = await supabase.from('user_course_permissions').select('course_id').eq('user_id', profile.id).limit(1)
    firstCourseId = data?.[0]?.course_id || null
  }

  if (firstCourseId) {
    redirect(`/courses/${firstCourseId}/dashboard`)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
      <p style={{ color: '#6b7280' }}>No tenés cursos asignados. Pedile al administrador que te asigne acceso.</p>
    </div>
  )
}
