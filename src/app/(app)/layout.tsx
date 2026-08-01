'use client'
// src/app/(app)/layout.tsx
//
// Antes resolvía sesión, perfil y cursos en el servidor. Ahora lo hace
// SessionProvider en el navegador, porque un sitio estático no tiene servidor
// que pueda mirar la cookie antes de responder.
import { SessionProvider, useSession } from '@/lib/session-context'
import Sidebar from '@/components/layout/Sidebar'

function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, courses, pinnedCourseId } = useSession()

  return (
    <div className="app-shell">
      <Sidebar profile={profile} courses={courses} pinnedCourseId={pinnedCourseId} />
      <main className="app-main">
        {children}
      </main>
    </div>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  )
}
