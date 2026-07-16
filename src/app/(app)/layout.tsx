// src/app/(app)/layout.tsx
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/supabase/session'
import Sidebar from '@/components/layout/Sidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // requireProfile() está deduplicado por request (cache): esta llamada comparte
  // el getUser()/perfil con el course-layout y la página hijos → 1 sola ida a Auth.
  const profile = await requireProfile()
  const supabase = await createClient()

  // Obtener cursos NO archivados accesibles por el usuario.
  // - admin (full global): ve todos.
  // - guest (read global): ve todos (en modo lectura; la edición se controla
  //   por curso más adelante).
  // - teacher (sin global): solo los cursos donde tiene permiso asignado.
  let courses = []
  if (profile.global_role === 'admin' || profile.global_role === 'guest') {
    const { data } = await supabase
      .from('courses')
      .select('*, subjects(name)')
      .not('status', 'eq', 'archived')
      .order('year', { ascending: false })
      .order('name')
    courses = data || []
  } else {
    const { data: perms } = await supabase
      .from('user_course_permissions')
      .select('course_id')
      .eq('user_id', profile.id)
    const courseIds = Array.from(new Set((perms || []).map((p: { course_id: string }) => p.course_id)))
    if (courseIds.length > 0) {
      const { data } = await supabase
        .from('courses')
        .select('*, subjects(name)')
        .in('id', courseIds)
        .not('status', 'eq', 'archived')
        .order('year', { ascending: false })
      courses = data || []
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar profile={profile} courses={courses} />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {children}
      </main>
    </div>
  )
}
