'use client'
// src/app/(app)/courses/[courseId]/todos/page.tsx
// Carga los datos en el navegador y se los pasa al componente de pantalla,
// que no cambió. El perfil sale del SessionProvider, así no se vuelve a pedir.
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/session-context'
import PageLoading from '@/components/layout/PageLoading'
import TodosClient from './TodosClient'
import type { Todo } from '@/types'

interface SessionRef { id: string; class_number: number | null; title: string }
interface Data { courseName: string; todos: Todo[]; sessions: SessionRef[] }

export default function TodosPage() {
  const { courseId } = useParams<{ courseId: string }>()
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
        courseName: courseRes.data?.name || '',
        todos: todosRes.data || [],
        sessions: sessionsRes.data || [],
      })
    })()
    return () => { cancelled = true }
  }, [courseId, supabase])

  if (!data) return <PageLoading />

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
