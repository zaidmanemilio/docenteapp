'use client'
// src/app/(app)/page.tsx
//
// Manda al panel del primer curso de la lista. La lista ya viene del
// SessionProvider con los archivados excluidos y el curso fijado adelante,
// así que "el primero" es el mismo que se ve arriba en el sidebar.
//
// Si no hay ningún curso, antes quedaba una sola frase gris en el medio de la
// pantalla. Es el caso más común de la plataforma —la mayoría de las cuentas
// no tiene ningún curso asignado— y era justo el que no explicaba nada ni
// ofrecía una salida. Ahora dice en qué estado está la cuenta, qué puede
// hacer igual y a quién pedirle acceso.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/session-context'
import { roleLabel, ROLE_HINT } from '@/lib/permissions'

export default function HomePage() {
  const router = useRouter()
  const { courses, profile } = useSession()
  const target = courses[0]
  const isAdmin = profile.global_role === 'admin'

  useEffect(() => {
    if (target) router.replace(`/courses/dashboard?c=${target.id}`)
  }, [target, router])

  if (target) return null

  return (
    <div className="empty-screen">
      <div className="empty-card">
        <i className="ti ti-folders empty-icon" aria-hidden="true"></i>

        <h1 className="page-title" style={{ fontSize: 'var(--text-2xl)' }}>
          Todavía no tenés cursos asignados
        </h1>

        <p className="empty-text">
          Tu cuenta está activa con el rol <strong>{roleLabel(profile.global_role)}</strong>.
          {' '}{ROLE_HINT[profile.global_role || 'teacher']}
          {' '}Para ver un cronograma, un calendario o la presentación de una
          materia, alguien con rol de administrador tiene que darte acceso a
          ese curso.
        </p>

        <div className="empty-actions">
          {isAdmin && (
            <button className="btn btn-primary" onClick={() => router.push('/courses/new')}>
              <i className="ti ti-plus" aria-hidden="true"></i> Crear un curso
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => router.push('/calendar')}>
            <i className="ti ti-calendar" aria-hidden="true"></i> Calendario unificado
          </button>
          <button className="btn btn-ghost" onClick={() => router.push('/archived')}>
            <i className="ti ti-archive" aria-hidden="true"></i> Cursos archivados
          </button>
          <button className="btn btn-ghost" onClick={() => router.push('/profile')}>
            <i className="ti ti-user" aria-hidden="true"></i> Mi perfil
          </button>
        </div>

        <p className="empty-note">
          Si ya pediste el acceso y seguís viendo esta pantalla, cerrá sesión y
          volvé a entrar: los permisos se leen al iniciar sesión.
        </p>
      </div>
    </div>
  )
}
