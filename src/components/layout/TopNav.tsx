'use client'
// src/components/layout/TopNav.tsx
//
// Reemplaza al sidebar lateral.
//
// El lateral mezclaba tres cosas distintas en una sola columna de 220px:
// en qué curso estás, dónde estás dentro del curso, y tu cuenta. Acá cada
// una tiene su lugar: el curso a la izquierda, las secciones en su propia
// fila, la cuenta a la derecha. Y la app recupera esos 220px de ancho, que
// en pantallas de tablas y cronogramas se notan.
import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCourseId } from '@/lib/use-course'
import { useSession } from '@/lib/session-context'
import { roleLabel } from '@/lib/permissions'
import { colorDeCurso } from '@/lib/course-color'
import ThemeToggle from './ThemeToggle'
import type { Profile, Course } from '@/types'

const SECCIONES = [
  { key: 'presentation', label: 'Presentación' },
  { key: 'schedule',     label: 'Cronograma' },
  { key: 'todos',        label: 'Tareas' },
  { key: 'dashboard',    label: 'Panel' },
  { key: 'import',       label: 'Importar' },
  { key: 'config',       label: 'Configuración' },
  { key: 'users',        label: 'Usuarios', adminOnly: true },
]

function iniciales(nombre: string) {
  return nombre.split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase()
}

interface TopNavProps {
  profile: Profile
  courses: Course[]
  pinnedCourseId?: string | null
}

export default function TopNav({ profile, courses, pinnedCourseId = null }: TopNavProps) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const activeCourseId = useCourseId()
  const { reload } = useSession()

  const [pinnedId, setPinnedId] = useState<string | null>(pinnedCourseId)
  const [pinning, setPinning] = useState(false)
  const [userMenu, setUserMenu] = useState(false)
  const userBox = useRef<HTMLDivElement>(null)

  const isAdmin = profile.global_role === 'admin'
  const sinCursos = courses.length === 0
  const partes = pathname.split('/')
  const seccionActual = partes[1] === 'courses' && partes[2] && partes[2] !== 'new' ? partes[2] : ''
  const enCalendario = pathname === '/calendar'

  const cursoActivo = courses.find(c => c.id === activeCourseId) || courses[0] || null
  const colorCurso = cursoActivo ? colorDeCurso(cursoActivo.id) : 'transparent'

  // Grado y posgrado, como dos listas. Los cursos sin nivel cargado cuentan
  // como grado, que es lo que hacía el filtro del sidebar.
  const posgrado = courses.filter(c => c.level === 'posgrado')
  const grado = courses.filter(c => c.level !== 'posgrado')

  // Cerrar el menú de la cuenta al hacer click afuera o con Escape.
  useEffect(() => {
    if (!userMenu) return
    function fuera(e: MouseEvent) {
      if (userBox.current && !userBox.current.contains(e.target as Node)) setUserMenu(false)
    }
    function tecla(e: KeyboardEvent) { if (e.key === 'Escape') setUserMenu(false) }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [userMenu])

  useEffect(() => { setUserMenu(false) }, [pathname])

  function irASeccion(key: string) {
    const destino = activeCourseId || courses[0]?.id
    if (!destino) return
    router.push(`/courses/${key}?c=${destino}`)
  }

  function elegirCurso(id: string) {
    // Se mantiene la sección en la que estás al cambiar de curso: si estabas
    // mirando el Cronograma, seguís en el Cronograma del otro curso.
    const seccion = seccionActual || 'presentation'
    router.push(`/courses/${seccion}?c=${id}`)
  }

  async function alternarPin(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    if (pinning) return
    const siguiente = pinnedId === id ? null : id
    setPinnedId(siguiente)
    setPinning(true)
    const { error } = await supabase.auth.updateUser({ data: { pinned_course_id: siguiente } })
    setPinning(false)
    if (error) { setPinnedId(pinnedId); return }
    reload()
  }

  async function cerrarSesion() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function listaCursos(titulo: string, lista: Course[]) {
    if (lista.length === 0) return null
    return (
      <>
        <div className="course-group">{titulo}</div>
        {lista.map(c => (
          /* Dos botones hermanos, no uno adentro del otro: anidar un botón
             dentro de otro es HTML inválido y deja la chincheta fuera del
             recorrido con teclado. */
          <div key={c.id} className="course-row">
            <button
              className={`course-item${c.id === cursoActivo?.id ? ' is-current' : ''}`}
              onClick={() => elegirCurso(c.id)}
            >
              <span className="course-dot" style={{ background: colorDeCurso(c.id) }}></span>
              <span className="course-label">{c.name}</span>
              <span className="course-year">{c.year}</span>
            </button>
            <button
              className={`course-pin-btn${pinnedId === c.id ? ' is-pinned' : ''}`}
              onClick={e => alternarPin(e, c.id)}
              aria-pressed={pinnedId === c.id}
              title={pinnedId === c.id ? 'Quitar de favoritos' : 'Fijar como curso por defecto'}
              aria-label={pinnedId === c.id ? `Quitar ${c.name} de favoritos` : `Fijar ${c.name} como curso por defecto`}
            >
              <i className={pinnedId === c.id ? 'ti ti-pin-filled' : 'ti ti-pin'} aria-hidden="true"></i>
            </button>
          </div>
        ))}
      </>
    )
  }

  return (
    <header className="app-top">
      <div className="top-row">
        <a className="top-mark" href="/" onClick={e => { e.preventDefault(); router.push('/') }}>
          <i className="ti ti-school" aria-hidden="true"></i>
          <span>DocenteApp</span>
        </a>

        {/* Selector de curso: se abre al apuntarle. */}
        <div className="course-menu">
          <button className="course-btn" aria-haspopup="menu">
            {cursoActivo ? (
              <>
                <span className="course-dot" style={{ background: colorCurso }}></span>
                <span className="course-name">{cursoActivo.name}</span>
              </>
            ) : (
              <span className="course-name">Sin cursos</span>
            )}
            <i className="ti ti-chevron-down" aria-hidden="true"></i>
          </button>

          <div className="course-panel">
            <div className="course-panel-inner" role="menu">
              {sinCursos ? (
                <div style={{ padding: 'var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Todavía no tenés cursos asignados. Pedile a un administrador
                  que te dé acceso.
                </div>
              ) : (
                <>
                  {listaCursos('Grado', grado)}
                  {listaCursos('Posgrado', posgrado)}
                </>
              )}

              <div className="course-sep"></div>

              <button
                className={`course-item${enCalendario ? ' is-current' : ''}`}
                onClick={() => router.push('/calendar')}
              >
                <i className="ti ti-calendar-stats" style={{ width: '16px', fontSize: '15px' }} aria-hidden="true"></i>
                <span className="course-label">Calendario unificado</span>
              </button>
              {isAdmin && (
                <>
                  <button className="course-item" onClick={() => router.push('/archived')}>
                    <i className="ti ti-archive" style={{ width: '16px', fontSize: '15px' }} aria-hidden="true"></i>
                    <span className="course-label">Cursos archivados</span>
                  </button>
                  <button className="course-item" onClick={() => router.push('/courses/new')}>
                    <i className="ti ti-plus" style={{ width: '16px', fontSize: '15px' }} aria-hidden="true"></i>
                    <span className="course-label">Nuevo curso</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="top-actions">
          <ThemeToggle />

          <div ref={userBox} style={{ position: 'relative' }}>
            <button
              className="avatar-btn"
              style={{ background: colorDeCurso(profile.id) }}
              onClick={() => setUserMenu(o => !o)}
              aria-expanded={userMenu}
              aria-haspopup="menu"
              aria-label={`Cuenta de ${profile.full_name}`}
            >
              {iniciales(profile.full_name)}
            </button>

            {userMenu && (
              <div className="user-panel" role="menu">
                <div style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border)', marginBottom: 'var(--space-2)' }}>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {profile.full_name}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {roleLabel(profile.global_role)}
                  </div>
                </div>
                <button className="user-item" onClick={() => router.push('/profile')}>
                  <i className="ti ti-user" style={{ width: '16px' }} aria-hidden="true"></i> Mi perfil
                </button>
                <button className="user-item" onClick={cerrarSesion}>
                  <i className="ti ti-logout" style={{ width: '16px' }} aria-hidden="true"></i> Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Secciones del curso. */}
      <nav className="top-tabs" aria-label="Secciones del curso">
        {SECCIONES
          .filter(s => !s.adminOnly || isAdmin)
          .map(s => (
            <button
              key={s.key}
              className="top-tab"
              onClick={() => { if (!sinCursos) irASeccion(s.key) }}
              aria-current={seccionActual === s.key && !enCalendario ? 'page' : undefined}
              aria-disabled={sinCursos || undefined}
              title={sinCursos ? 'Necesitás un curso asignado para entrar acá.' : undefined}
            >
              {s.label}
            </button>
          ))}
      </nav>

      <div className="top-rail" style={{ background: cursoActivo && !enCalendario ? colorCurso : 'transparent' }}></div>
    </header>
  )
}
