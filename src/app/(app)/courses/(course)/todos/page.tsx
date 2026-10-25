'use client'
// src/app/(app)/courses/[courseId]/todos/page.tsx
// Carga los datos en el navegador y se los pasa al componente de pantalla,
// que no cambió. El perfil sale del SessionProvider, así no se vuelve a pedir.
import { useEffect, useState } from 'react'
import { useCourseId } from '@/lib/use-course'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/session-context'
import PageLoading from '@/components/layout/PageLoading'
import TodosClient from './TodosClient'
import type { Todo } from '@/types'

interface SessionRef { id: string; class_number: number | null; title: string }
interface Data { courseId: string; courseName: string; todos: Todo[]; sessions: SessionRef[] }

export default function TodosPage() {
  const courseId = useCourseId()
  const { profile } = useSession()
  const [supabase] = useState(() => createClient())
  const [data, setData] = useState<Data | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [courseRes, todosRes, sessionsRes] = await Promise.all([
        supabase.from('courses').select('name').eq('id', courseId).single(),
        supabase.from('todos').select('*').eq('course_id', courseId).order('created_at', { ascending: false }),
        supabase.from('sessions').select('id, class_number, title').eq('course_id', courseId).order('date'),
      ])
      if (cancelled) return
      setData({
        courseId,
        courseName: courseRes.data?.name || '',
        todos: todosRes.data || [],
        sessions: sessionsRes.data || [],
      })
    })()
    return () => { cancelled = true }
  }, [courseId, supabase])

  // Los datos traen el curso al que pertenecen, y la pantalla no se dibuja
  // hasta que ese curso es el de la URL.
  //
  // Sin esto, al cambiar de curso sin cambiar de sección el contenido quedaba
  // congelado en el curso anterior: el `key` se actualizaba antes que los
  // datos, así que el componente se volvía a montar con los datos viejos y,
  // cuando llegaban los nuevos, el key ya no cambiaba y useState(initial…) los
  // ignoraba. Había que irse a otra sección y volver para verlo bien.
  if (!data || data.courseId !== courseId) return <PageLoading />

  return (
    <TodosClient
      key={courseId}
      courseId={courseId}
      courseName={data.courseName}
      profile={profile}
      initialTodos={data.todos}
      initialSessions={data.sessions}
    />
  )
}
