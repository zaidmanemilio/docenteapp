'use client'
// src/app/(app)/page.tsx
//
// Manda al panel del primer curso de la lista. La lista ya viene del
// SessionProvider con los archivados excluidos y el curso fijado adelante,
// así que "el primero" es el mismo que se ve arriba en el sidebar.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/session-context'

export default function HomePage() {
  const router = useRouter()
  const { courses } = useSession()
  const target = courses[0]

  useEffect(() => {
    if (target) router.replace(`/courses/${target.id}/dashboard`)
  }, [target, router])

  if (target) return null

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '24px', textAlign: 'center' }}>
      <p style={{ color: 'var(--text-muted)' }}>
        No tenés cursos activos. Pedile al administrador que te asigne acceso, o
        restaurá uno desde <strong>Cursos archivados</strong>.
      </p>
    </div>
  )
}
