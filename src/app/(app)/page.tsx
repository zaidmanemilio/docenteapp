// src/app/(app)/page.tsx
import { redirect } from 'next/navigation'
import { getAccessibleCourses } from '@/lib/courses'

export default async function HomePage() {
  // getAccessibleCourses() ya excluye los archivados y deja el curso fijado
  // primero, así que "el primero de la lista" es exactamente lo que el usuario
  // ve arriba en el sidebar. Antes esta pantalla tenía su propia consulta, sin
  // filtrar por estado y sin contemplar el rol guest, y por eso podía mandarte
  // al panel de un curso que habías archivado.
  const courses = await getAccessibleCourses()
  const target = courses[0]

  if (target) {
    redirect(`/courses/${target.id}/dashboard`)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '24px', textAlign: 'center' }}>
      <p style={{ color: 'var(--text-muted)' }}>
        No tenés cursos activos. Pedile al administrador que te asigne acceso, o
        restaurá uno desde <strong>Cursos archivados</strong>.
      </p>
    </div>
  )
}
