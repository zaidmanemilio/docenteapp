// src/app/(app)/layout.tsx
import { requireProfile } from '@/lib/supabase/session'
import { getAccessibleCourses, getPinnedCourseId } from '@/lib/courses'
import Sidebar from '@/components/layout/Sidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // requireProfile() está deduplicado por request (cache): esta llamada comparte
  // el getUser()/perfil con el course-layout y la página hijos → 1 sola ida a Auth.
  // La lista de cursos vive en @/lib/courses para que el layout y la home usen
  // exactamente el mismo criterio (archivados fuera, curso fijado primero).
  const [profile, courses, pinnedCourseId] = await Promise.all([
    requireProfile(),
    getAccessibleCourses(),
    getPinnedCourseId(),
  ])

  return (
    <div className="app-shell">
      <Sidebar profile={profile} courses={courses} pinnedCourseId={pinnedCourseId} />
      <main className="app-main">
        {children}
      </main>
    </div>
  )
}
