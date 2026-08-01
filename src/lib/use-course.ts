'use client'
// src/lib/use-course.ts
//
// El curso activo dejó de viajar en la ruta (/courses/<id>/dashboard) y pasa a
// viajar como parámetro (/courses/dashboard?c=<id>).
//
// Motivo: un sitio estático no puede pre-generar una página por cada id de
// curso, porque los cursos se crean y archivan en runtime. Next exige
// generateStaticParams() para los segmentos dinámicos y no hay forma de
// resolverlo en tiempo de compilación. Con un parámetro, en cambio, existe una
// sola página /courses/dashboard que sirve para todos los cursos.
import { useSearchParams } from 'next/navigation'

/** Nombre del parámetro donde viaja el id del curso. */
export const COURSE_PARAM = 'c'

/** Id del curso activo, o '' si la URL no trae ninguno. */
export function useCourseId(): string {
  const params = useSearchParams()
  return params.get(COURSE_PARAM) ?? ''
}

/** Arma la URL de una sección para un curso: courseUrl('dashboard', id). */
export function courseUrl(section: string, courseId: string): string {
  return `/courses/${section}?${COURSE_PARAM}=${encodeURIComponent(courseId)}`
}
