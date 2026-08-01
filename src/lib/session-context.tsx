'use client'
// src/lib/session-context.tsx
//
// Reemplaza en el navegador lo que hasta ahora hacían el middleware y los
// server components: verificar que haya sesión, traer el perfil y la lista de
// cursos accesibles, y dejarlos disponibles para toda la app.
//
// Por qué existe: un sitio estático no tiene servidor que pueda mirar la
// cookie antes de responder. La protección pasa a ser del lado del cliente.
// Eso NO afecta la seguridad de los datos —de eso se ocupa la RLS de Postgres,
// que corre en la base— pero sí implica que el HTML se sirve a cualquiera y
// que hay un instante de "Cargando…" antes de redirigir a quien no tiene
// sesión.
//
// Se carga UNA sola vez en el layout y se comparte por contexto, así las
// pantallas no repiten la consulta de perfil/cursos en cada navegación.
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile, Course } from '@/types'

export const PINNED_META_KEY = 'pinned_course_id'

interface SessionValue {
  profile: Profile
  courses: Course[]
  pinnedCourseId: string | null
  /** Relee perfil y cursos (después de crear/archivar un curso, por ejemplo). */
  reload: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

/** Datos de la sesión actual. Solo válido dentro de <SessionProvider>. */
export function useSession(): SessionValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession() debe usarse dentro de <SessionProvider>.')
  return ctx
}

/**
 * Cursos NO archivados accesibles, con el fijado primero.
 * Mismo criterio que tenía src/lib/courses.ts en el servidor: admin y guest
 * ven todos, el resto solo donde tiene permiso asignado.
 */
async function loadCourses(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  globalRole: string | undefined,
  pinnedId: string | null,
): Promise<Course[]> {
  let courses: Course[] = []

  if (globalRole === 'admin' || globalRole === 'guest') {
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
      .eq('user_id', userId)
    const ids = Array.from(new Set((perms || []).map((p: { course_id: string }) => p.course_id)))
    if (ids.length > 0) {
      const { data } = await supabase
        .from('courses')
        .select('*, subjects(name)')
        .in('id', ids)
        .not('status', 'eq', 'archived')
        .order('year', { ascending: false })
        .order('name')
      courses = data || []
    }
  }

  if (pinnedId) {
    const i = courses.findIndex(c => c.id === pinnedId)
    if (i > 0) courses = [courses[i], ...courses.slice(0, i), ...courses.slice(i + 1)]
  }
  return courses
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [value, setValue] = useState<SessionValue | null>(null)
  const [checked, setChecked] = useState(false)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setChecked(true)
      router.replace('/login')
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (!profile) {
      setChecked(true)
      router.replace('/login')
      return
    }

    const rawPin = user.user_metadata?.[PINNED_META_KEY]
    const pinnedCourseId = typeof rawPin === 'string' && rawPin ? rawPin : null
    const courses = await loadCourses(supabase, user.id, profile.global_role, pinnedCourseId)

    setValue({ profile, courses, pinnedCourseId, reload: load })
    setChecked(true)
  }, [supabase, router])

  useEffect(() => { load() }, [load])

  // Si la sesión se cierra en otra pestaña, salir también acá.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.replace('/login')
    })
    return () => sub.subscription.unsubscribe()
  }, [supabase, router])

  if (!checked || !value) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100dvh', color: 'var(--text-muted)', fontSize: '14px',
      }}>
        Cargando…
      </div>
    )
  }

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
