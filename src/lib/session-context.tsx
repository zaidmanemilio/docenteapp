'use client'
// src/lib/session-context.tsx
//
// Verifica la sesión y carga perfil + cursos una sola vez para toda la app.
//
// El arranque encadenaba 4 viajes a Supabase que dependían uno del otro
// (validar sesión -> perfil -> permisos -> cursos). Desde Europa cada viaje
// cuesta unos 209 ms, así que era casi un segundo de espera antes de pintar
// nada. Ahora son dos pasos y el primero ni siquiera va por red.
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile, Course } from '@/types'

export const PINNED_META_KEY = 'pinned_course_id'

interface SessionValue {
  profile: Profile
  courses: Course[]
  pinnedCourseId: string | null
  /** Relee perfil y cursos (después de crear o archivar un curso). */
  reload: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

/** Datos de la sesión actual. Solo válido dentro de <SessionProvider>. */
export function useSession(): SessionValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession() debe usarse dentro de <SessionProvider>.')
  return ctx
}

/** Deja el curso fijado primero. Si ya no está accesible, se ignora solo. */
function pinnedFirst(courses: Course[], pinnedId: string | null): Course[] {
  if (!pinnedId) return courses
  const i = courses.findIndex(c => c.id === pinnedId)
  if (i <= 0) return courses
  return [courses[i], ...courses.slice(0, i), ...courses.slice(i + 1)]
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [value, setValue] = useState<SessionValue | null>(null)
  const [checked, setChecked] = useState(false)

  const load = useCallback(async () => {
    // getSession() lee el token que ya está guardado en el navegador; no hace
    // ninguna llamada de red. getUser(), que es lo que había antes, iba hasta
    // el servidor de Auth a revalidarlo en cada carga.
    //
    // Esto NO debilita la seguridad: Postgres verifica la firma del token en
    // cada consulta y aplica RLS. Con un token manipulado no se obtiene un
    // solo dato; a lo sumo se ve la interfaz vacía.
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) {
      setChecked(true)
      router.replace('/login')
      return
    }

    // Perfil y cursos en una sola llamada. El filtrado de qué cursos ve cada
    // uno lo sigue haciendo la RLS: my_context() es SECURITY INVOKER.
    const { data, error } = await supabase.rpc('my_context')
    const profile = (data as { profile?: Profile } | null)?.profile

    if (error || !profile) {
      // Token vencido o perfil inexistente: a login.
      setChecked(true)
      router.replace('/login')
      return
    }

    const rawPin = user.user_metadata?.[PINNED_META_KEY]
    const pinnedCourseId = typeof rawPin === 'string' && rawPin ? rawPin : null
    const courses = pinnedFirst(
      ((data as { courses?: Course[] }).courses || []) as Course[],
      pinnedCourseId,
    )

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
