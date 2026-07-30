// src/app/(app)/courses/[courseId]/todos/page.tsx
// Server component: resuelve los datos antes de mandar el HTML, así la
// pantalla llega pintada en vez de mostrar "Cargando..." mientras el browser
// hidrata y recién ahí consulta. requireProfile() está deduplicado por
// request, o sea que reusa la validación que ya hicieron los layouts.
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/supabase/session'
import TodosClient from './TodosClient'

export default async function TodosPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params
  const profile = await requireProfile()
  const supabase = await createClient()

  const [courseRes, todosRes, sessionsRes] = await Promise.all([
    supabase.from('courses').select('name').eq('id', courseId).single(),
    supabase.from('todos').select('*').eq('course_id', courseId).order('created_at', { ascending: false }),
    supabase.from('sessions').select('id, class_number, title').eq('course_id', courseId).order('date'),
  ])

  return (
    <TodosClient
      courseId={courseId}
      courseName={courseRes.data?.name || ''}
      profile={profile}
      initialTodos={todosRes.data || []}
      initialSessions={sessionsRes.data || []}
    />
  )
}
