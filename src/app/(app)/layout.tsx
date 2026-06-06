// src/app/(app)/layout.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/layout/Sidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Obtener perfil
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  // Obtener cursos accesibles con permisos
  let courses = []
  if (profile.global_role === 'admin') {
    const { data } = await supabase
      .from('courses')
      .select('*, subjects(name)')
      .order('year', { ascending: false })
      .order('name')
    courses = data || []
  } else {
    const { data: perms } = await supabase
      .from('user_course_permissions')
      .select('course_id')
      .eq('user_id', user.id)
    const courseIds = [...new Set((perms || []).map((p: {course_id: string}) => p.course_id))]
    if (courseIds.length > 0) {
      const { data } = await supabase
        .from('courses')
        .select('*, subjects(name)')
        .in('id', courseIds)
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
