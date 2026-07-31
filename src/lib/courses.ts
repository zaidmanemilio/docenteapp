// src/lib/courses.ts
// Fuente única de verdad para "qué cursos ve este usuario y en qué orden".
//
// Antes esta lógica estaba duplicada en el layout y en la home, y estaban
// desalineadas: el layout filtraba los archivados y contemplaba el rol
// 'guest', pero la home no hacía ninguna de las dos cosas. Por eso al entrar
// te podía mandar al panel de un curso que habías archivado.
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/supabase/session'
import type { Course } from '@/types'

/** Clave dentro de user_metadata donde se guarda el curso fijado. */
export const PINNED_META_KEY = 'pinned_course_id'

/**
 * Curso fijado por el usuario, o null.
 * Se guarda en los metadatos del usuario de Auth: es una preferencia por
 * persona (no del curso, que es compartido) y viaja entre dispositivos.
 * Deduplicado por request.
 */
export const getPinnedCourseId = cache(async (): Promise<string | null> => {
  const user = await getUser()
  const raw = user?.user_metadata?.[PINNED_META_KEY]
  return typeof raw === 'string' && raw ? raw : null
})

/**
 * Cursos NO archivados a los que el usuario tiene acceso, ordenados con el
 * curso fijado primero y después por año (desc) y nombre.
 *
 * - admin y guest: ven todos (guest en modo lectura).
 * - resto: solo los cursos donde tienen permiso asignado.
 *
 * Deduplicado por request, así el layout y la home comparten una sola consulta.
 */
export const getAccessibleCourses = cache(async (): Promise<Course[]> => {
  const user = await getUser()
  if (!user) return []

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('global_role')
    .eq('id', user.id)
    .single()

  const globalRole = profile?.global_role
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
      .eq('user_id', user.id)
    const courseIds = Array.from(
      new Set((perms || []).map((p: { course_id: string }) => p.course_id)),
    )
    if (courseIds.length > 0) {
      const { data } = await supabase
        .from('courses')
        .select('*, subjects(name)')
        .in('id', courseIds)
        .not('status', 'eq', 'archived')
        .order('year', { ascending: false })
        .order('name')
      courses = data || []
    }
  }

  // El curso fijado va primero. Si quedó archivado o dejó de ser accesible,
  // simplemente no aparece y el orden normal sigue valiendo.
  const pinnedId = await getPinnedCourseId()
  if (pinnedId) {
    const i = courses.findIndex(c => c.id === pinnedId)
    if (i > 0) courses = [courses[i], ...courses.slice(0, i), ...courses.slice(i + 1)]
  }

  return courses
})
