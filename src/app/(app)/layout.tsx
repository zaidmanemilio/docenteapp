'use client'
// src/app/(app)/layout.tsx
//
// Antes resolvía sesión, perfil y cursos en el servidor. Ahora lo hace
// SessionProvider en el navegador, porque un sitio estático no tiene servidor
// que pueda mirar la cookie antes de responder.
import { Suspense } from 'react'
import { SessionProvider, useSession } from '@/lib/session-context'
import TopNav from '@/components/layout/TopNav'
import PageLoading from '@/components/layout/PageLoading'
import { DialogProvider } from '@/components/ui/Dialog'

function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, courses, pinnedCourseId } = useSession()

  return (
    <div className="app-shell">
      <TopNav profile={profile} courses={courses} pinnedCourseId={pinnedCourseId} />
      <main className="app-main">
        {children}
      </main>
    </div>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // El curso activo viaja en la query, y leerla (useSearchParams) exige un
  // límite de Suspense cuando la página se genera de forma estática.
  return (
    <SessionProvider>
      <DialogProvider>
        <Suspense fallback={<PageLoading />}>
          <AppShell>{children}</AppShell>
        </Suspense>
      </DialogProvider>
    </SessionProvider>
  )
}
