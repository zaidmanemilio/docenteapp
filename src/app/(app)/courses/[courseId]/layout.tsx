// src/app/(app)/courses/[courseId]/layout.tsx
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function CourseLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ courseId: string }>
}) {
  const { courseId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Verificar que el usuario tiene acceso al curso
  const { data: profile } = await supabase.from('profiles').select('global_role').eq('id', user.id).single()

  if (profile?.global_role !== 'admin') {
    const { data: perm } = await supabase
      .from('user_course_permissions')
      .select('id')
      .eq('user_id', user.id)
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
