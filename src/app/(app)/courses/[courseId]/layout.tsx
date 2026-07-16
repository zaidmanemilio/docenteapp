// src/app/(app)/courses/[courseId]/layout.tsx
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/supabase/session'

export default async function CourseLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ courseId: string }>
}) {
  const { courseId } = await params
  // Deduplicado por request: comparte usuario+perfil con el app-layout padre.
  const profile = await requireProfile()
  const supabase = await createClient()
  const globalRole = profile.global_role

  // Acceso = admin o guest (lectura global), o tener algún permiso en el curso.
  if (globalRole !== 'admin' && globalRole !== 'guest') {
    const { data: perm } = await supabase
      .from('user_course_permissions')
      .select('id')
      .eq('user_id', profile.id)
      .eq('course_id', courseId)
      .limit(1)

    if (!perm || perm.length === 0) notFound()
  }

  const { data: course } = await supabase
    .from('courses')
    .select('id, name')
    .eq('id', courseId)
    .single()

  if (!course) notFound()

  return <>{children}</>
}
