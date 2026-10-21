'use client'
// src/app/(app)/courses/(course)/calendar/page.tsx
//
// La Agenda y el Cronograma eran dos pantallas con exactamente los mismos
// datos: la tabla tenía los links y las notas, la agenda tenía la lectura
// cómoda, y había que saltar de una a otra. Ahora son una sola, y la vista
// de agenda es la que abre por defecto en /courses/schedule.
//
// Esta ruta queda solo para que no se rompan los enlaces y favoritos que ya
// existen. No pinta nada: redirige y se va.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCourseId } from '@/lib/use-course'
import PageLoading from '@/components/layout/PageLoading'

export default function CalendarRedirectPage() {
  const router = useRouter()
  const courseId = useCourseId()

  useEffect(() => {
    router.replace(courseId ? `/courses/schedule?c=${courseId}` : '/courses/schedule')
  }, [router, courseId])

  return <PageLoading />
}
