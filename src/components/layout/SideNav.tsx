'use client'
// src/components/layout/SideNav.tsx
//
// Columna de navegación a la izquierda en pantalla grande; cajón que se
// abre desde una barra fina en pantalla chica.
//
// Conserva la forma del menú superior que reemplazó al sidebar viejo —el
// selector de curso que se despliega al apuntarle, separado en Grado y
// Posgrado, y el botón de tema— pero vuelve a la columna, porque con el
// menú arriba el contenido corría de borde a borde: en un monitor ancho
// una fila del cronograma medía dos mil píxeles.
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
  { key: 'presentation', label: 'Presentación', icon: 'ti-id-badge' },
  { key: 'schedule',     label: 'Cronograma',   icon: 'ti-calendar-month' },
  { key: 'todos',        label: 'Tareas',       icon: 'ti-checks' },
  { key: 'dashboard',    label: 'Panel',        icon: 'ti-layout-dashboard' },
  { key: 'import',       label: 'Importar',     icon: 'ti-upload' },
  { key: 'config',       label: 'Configuración', icon: 'ti-settings' },
  { key: 'users',        label: 'Usuarios',     icon: 'ti-users', adminOnly: true },
]

function iniciales(nombre: string) {
  return nombre.split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase()
}

interface SideNavProps {
  profile: Profile
  courses: Course[]
  pinnedCourseId?: string | null
}

export default function SideNav({ profile, courses, pinnedCourseId = null }: SideNavProps) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const activeCourseId = useCourseId()
  const { reload } = useSession()

  const [pinnedId, setPinnedId] = useState<string | null>(pinnedCourseId)
  const [pinning, setPinning] = useState(false)
  const [userMenu, setUserMenu] = useState(false)
  const [cajonAbierto, setCajonAbierto] = useState(false)
  // Solo se usa en el cajón: ahí no hay puntero, así que el panel de
  // cursos se abre tocando el botón en vez de al apuntarle.
  const [cursosAbiertos, setCursosAbiertos] = useState(false)
  const userBox = useRef<HTMLDivElement>(null)

  const isAdmin = profile.global_role === 'admin'
  const sinCursos = courses.length === 0
  const partes = pathname.split('/')
  const seccionActual = partes[1] === 'courses' && partes[2] && partes[2] !== 'new' ? partes[2] : ''
  const enCalendario = pathname === '/calendar'

  const cursoActivo = courses.find(c => c.id === activeCourseId) || courses[0] || null
  const colorCurso = cursoActivo ? colorDeCurso(cursoActivo.id) : 'var(--border)'

  const posgrado = courses.filter(c => c.level === 'posgrado')
  const grado = courses.filter(c => c.level !== 'posgrado')

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

  // Al navegar se cierra todo: en celular el cajón quedaría tapando.
  useEffect(() => {
    setUserMenu(false)
    setCajonAbierto(false)
    setCursosAbiertos(false)
  }, [pathname])

  // Escape cierra el cajón.
  useEffect(() => {
    if (!cajonAbierto) return
    function tecla(e: KeyboardEvent) { if (e.key === 'Escape') setCajonAbierto(false) }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [cajonAbierto])

  function irASeccion(key: string) {
    const destino = activeCourseId || courses[0]?.id
    if (!destino) return
    router.push(`/courses/${key}?c=${destino}`)
  }

  function elegirCurso(id: string) {
    // Se mantiene la sección al cambiar de curso: si estabas mirando el
    // Cronograma, seguís en el Cronograma del otro curso.
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
    <>
      {/* Barra fina: solo aparece abajo de 1024px (lo decide globals.css). */}
      <div className="app-bar">
        <button
          className="icon-btn"
          onClick={() => setCajonAbierto(true)}
          aria-label="Abrir menú de navegación"
          aria-expanded={cajonAbierto}
          aria-controls="app-nav"
        >
          <i className="ti ti-menu-2" aria-hidden="true"></i>
        </button>
        <span className="bar-title">
          {cursoActivo && (
            <span className="course-dot" style={{ background: colorCurso }}></span>
          )}
          {cursoActivo ? cursoActivo.name : 'DocenteApp'}
        </span>
        <ThemeToggle />
      </div>

      <div
        className={`nav-backdrop${cajonAbierto ? ' is-open' : ''}`}
        onClick={() => setCajonAbierto(false)}
        aria-hidden="true"
      />

      <nav id="app-nav" className={`app-nav${cajonAbierto ? ' is-open' : ''}`} aria-label="Navegación principal">
        <div className="nav-head">
          <a className="nav-mark" href="/" onClick={e => { e.preventDefault(); router.push('/') }}>
            <i className="ti ti-school" aria-hidden="true"></i>
            DocenteApp
          </a>
          {/* Arriba y a la derecha de donde esté la navegación. Con el menú
              en columna, eso es el extremo de esta fila. */}
          <span className="solo-ancho"><ThemeToggle /></span>
        </div>

        {/* Selector de curso. */}
        <div className={`course-menu${cursosAbiertos ? ' is-expanded' : ''}`}>
          <button
            className="course-btn"
            style={{ borderLeftColor: colorCurso }}
            aria-haspopup="menu"
            aria-expanded={cursosAbiertos}
            onClick={() => setCursosAbiertos(o => !o)}
          >
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

        {/* Secciones del curso. */}
        <div className="nav-list">
          {SECCIONES
            .filter(s => !s.adminOnly || isAdmin)
            .map(s => (
              <button
                key={s.key}
                className="nav-item"
                onClick={() => { if (!sinCursos) irASeccion(s.key) }}
                aria-current={seccionActual === s.key && !enCalendario ? 'page' : undefined}
                aria-disabled={sinCursos || undefined}
                title={sinCursos ? 'Necesitás un curso asignado para entrar acá.' : undefined}
              >
                <i className={`ti ${s.icon}`} aria-hidden="true"></i>
                {s.label}
              </button>
            ))}
        </div>

        {/* Pie: tema y cuenta. */}
        <div className="nav-foot">
          <div ref={userBox} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <button
              className="user-item"
              onClick={() => setUserMenu(o => !o)}
              aria-expanded={userMenu}
              aria-haspopup="menu"
            >
              <span
                className="avatar-btn"
                style={{ background: colorDeCurso(profile.id), width: '28px', height: '28px', fontSize: '10px', cursor: 'inherit' }}
                aria-hidden="true"
              >
                {iniciales(profile.full_name)}
              </span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {profile.full_name}
              </span>
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
      </nav>
    </>
  )
}
