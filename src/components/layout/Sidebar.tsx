'use client'
// src/components/layout/Sidebar.tsx
// Agrega "Calendario unificado" como sección global (fuera del curso activo)

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCourseId } from '@/lib/use-course'
import { useSession } from '@/lib/session-context'
import type { Profile, Course } from '@/types'

interface SidebarProps {
  profile: Profile
  courses: Course[]
  /** Curso fijado por el usuario (va primero en la lista y es el que abre la home). */
  pinnedCourseId?: string | null
}

const NAV_ITEMS = [
  { key: 'dashboard',    label: 'Dashboard',          icon: 'ti-layout-dashboard' },
  { key: 'presentation', label: 'Presentación',        icon: 'ti-id-badge'         },
  { key: 'schedule',     label: 'Cronograma',          icon: 'ti-calendar-event'   },
  { key: 'calendar',     label: 'Agenda',              icon: 'ti-calendar-month'   },
  { key: 'import',       label: 'Importar',            icon: 'ti-upload'           },
  { key: 'todos',        label: 'Tareas pendientes',   icon: 'ti-checks'           },
  { key: 'config',       label: 'Configuración',       icon: 'ti-settings'         },
  { key: 'users',        label: 'Usuarios y permisos', icon: 'ti-users', adminOnly: true },
]

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

const AVATAR_COLORS = ['#6366f1','#0d9488','#be185d','#d97706','#059669','#6b7280']
function getColor(id: string) {
  let n = 0
  for (const c of id) n += c.charCodeAt(0)
  return AVATAR_COLORS[n % AVATAR_COLORS.length]
}

export default function Sidebar({ profile, courses, pinnedCourseId = null }: SidebarProps) {
  const router   = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  // Se refleja al instante al fijar/desfijar; el servidor se sincroniza
  // después con router.refresh().
  const { reload } = useSession()
  const [pinnedId, setPinnedId] = useState<string | null>(pinnedCourseId)
  const [pinning, setPinning] = useState(false)

  // El curso activo ahora viaja en la query (?c=…) y la sección en la ruta
  // (/courses/<sección>). Antes ambos salían del pathname.
  const activeCourseId = useCourseId()
  const parts = pathname.split('/')
  const currentSection = parts[1] === 'courses' && parts[2] && parts[2] !== 'new' ? parts[2] : ''

  const isAdmin   = profile.global_role === 'admin'
  const [levelFilter, setLevelFilter] = useState('all')
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  // Drawer móvil: en pantallas chicas el sidebar se abre/cierra.
  const [mobileOpen, setMobileOpen] = useState(false)
// Los cursos sin nivel cargado cuentan como "grado" (comportamiento previo).
const visibleCourses = levelFilter === 'all'
  ? courses
  : courses.filter(c => c.level === levelFilter || (!c.level && levelFilter === 'grado'))

  // El curso fijado siempre arriba. El servidor ya lo manda ordenado así, pero
  // se reordena también acá para que el cambio se vea sin esperar el refresh.
  const filteredCourses = pinnedId
    ? [...visibleCourses].sort((a, b) =>
        (a.id === pinnedId ? -1 : 0) - (b.id === pinnedId ? -1 : 0))
    : visibleCourses
  const roleLabel = profile.global_role === 'admin' ? 'Administrador'
    : profile.global_role === 'teacher' ? 'Docente' : 'Invitado'

  function navigate(section: string) {
    if (!activeCourseId) {
      const first = courses[0]?.id
      if (first) router.push(`/courses/${section}?c=${first}`)
      return
    }
    router.push(`/courses/${section}?c=${activeCourseId}`)
  }

  function selectCourse(cid: string) {
    router.push(`/courses/dashboard?c=${cid}`)
  }

  // Fijar / desfijar. La preferencia se guarda en los metadatos del usuario de
  // Auth (es de la persona, no del curso, que es compartido con otros docentes)
  // y por eso viaja también al celular.
  async function togglePin(e: React.MouseEvent, cid: string) {
    e.stopPropagation() // no navegar al curso al tocar el pin
    if (pinning) return
    const next = pinnedId === cid ? null : cid
    setPinnedId(next)
    setPinning(true)
    const { error } = await supabase.auth.updateUser({ data: { pinned_course_id: next } })
    setPinning(false)
    if (error) {
      setPinnedId(pinnedId) // revertir si falló
      return
    }
    reload() // que la home y el orden tomen el cambio
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const isUnifiedCalendar = pathname === '/calendar'

  // Al navegar a otra pantalla, cerrar el drawer (en móvil quedaría tapando).
  useEffect(() => { setMobileOpen(false) }, [pathname])

  return (
    <>

      {/* Botón de menú — solo visible en móvil (lo controla globals.css).
          Lleva la palabra "Menú" además del ícono: un cuadrado con un ícono
          solo no se entiende como algo apretable. */}
      <button
        className={`sidebar-toggle${mobileOpen ? ' is-hidden' : ''}`}
        onClick={() => setMobileOpen(true)}
        aria-label="Abrir menú de navegación"
        aria-expanded={mobileOpen}
        aria-controls="app-sidebar"
      >
        <i className="ti ti-menu-2" aria-hidden="true"></i>
        <span>Menú</span>
      </button>

      {/* Capa oscura: al tocarla se cierra el menú */}
      <div
        className={`sidebar-backdrop${mobileOpen ? ' is-open' : ''}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      <nav id="app-sidebar" className={`app-sidebar${mobileOpen ? ' is-open' : ''}`}>
        {/* Logo */}
        <div className="sidebar-head" style={{ borderBottom: '1px solid var(--sidebar-border)' }}>
          <div>
            <h1 style={{ fontSize: '13px', fontWeight: 600, color: '#fff', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              DocenteApp
            </h1>
            <p style={{ fontSize: '11px', color: 'var(--sidebar-text)', marginTop: '2px' }}>Gestión docente</p>
          </div>
          {/* Cerrar el drawer — solo móvil. Con texto para que se entienda. */}
          <button
            className="sidebar-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar menú"
          >
            <i className="ti ti-x" aria-hidden="true"></i>
            <span>Cerrar</span>
          </button>
        </div>

        {/* Calendario unificado — sección global */}
        <div style={{ padding: '8px 8px 0' }}>
          <div
            onClick={() => router.push('/calendar')}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 10px', borderRadius: '8px', cursor: 'pointer',
              color: isUnifiedCalendar ? 'var(--accent-light)' : 'var(--sidebar-text)',
              background: isUnifiedCalendar ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.04)',
              fontSize: '13px', border: '1px solid rgba(99,102,241,0.2)',
            }}
          >
            <i className="ti ti-calendar-stats" style={{ fontSize: '16px', width: '18px' }} aria-hidden="true"></i>
            <span style={{ fontWeight: isUnifiedCalendar ? 600 : 400 }}>Calendario unificado</span>
          </div>
        </div>

        {/* Lista de cursos */}
        <div style={{ padding: '12px 16px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
  <p style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#555575', margin: 0 }}>
    Mis cursos
  </p>
  <select
    value={levelFilter}
    onChange={e => setLevelFilter(e.target.value)}
    style={{ fontSize: '10px', background: 'transparent', border: '1px solid #3d3d5e', borderRadius: '4px', color: 'var(--sidebar-text)', padding: '2px 4px', cursor: 'pointer', fontFamily: 'inherit' }}
  >
    <option value="all">Todos</option>
    <option value="grado">Grado</option>
    <option value="posgrado">Posgrado</option>
  </select>
</div>
<div style={{ padding: '0 8px', overflowY: 'auto', maxHeight: '180px' }}>
  {filteredCourses.map(c => (
    <div
      key={c.id}
      className="course-row"
      onClick={() => selectCourse(c.id)}
      style={{
        padding: '7px 10px', borderRadius: '8px', cursor: 'pointer',
        marginBottom: '2px',
        color: activeCourseId === c.id ? 'var(--accent-light)' : 'var(--sidebar-text)',
        background: activeCourseId === c.id ? 'rgba(99,102,241,0.18)' : 'transparent',
        fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px',
      }}
    >
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor', flexShrink: 0 }}></span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
      <button
        className={`course-pin${pinnedId === c.id ? ' is-pinned' : ''}`}
        onClick={e => togglePin(e, c.id)}
        title={pinnedId === c.id ? 'Quitar de favoritos' : 'Fijar como curso por defecto'}
        aria-label={pinnedId === c.id ? `Quitar ${c.name} de favoritos` : `Fijar ${c.name} como curso por defecto`}
        aria-pressed={pinnedId === c.id}
      >
        <i className={pinnedId === c.id ? 'ti ti-pin-filled' : 'ti ti-pin'} aria-hidden="true"></i>
      </button>
    </div>
  ))}
  {filteredCourses.length === 0 && (
    <p style={{ fontSize: '11px', color: '#555575', padding: '6px 10px' }}>
      Sin cursos de {levelFilter === 'grado' ? 'Grado' : 'Posgrado'}.
    </p>
  )}
</div>
{/* Nuevo curso: FIJO fuera del scroll, así nunca queda tapado */}
{isAdmin && (
  <div style={{ padding: '4px 8px 0' }}>
    <div
      onClick={() => router.push('/courses/new')}
      style={{
        padding: '7px 10px', borderRadius: '8px', cursor: 'pointer',
        color: pathname === '/courses/new' ? 'var(--accent-light)' : '#555575',
        background: pathname === '/courses/new' ? 'rgba(99,102,241,0.18)' : 'transparent',
        fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px',
        borderTop: '1px solid var(--sidebar-border)', paddingTop: '10px',
      }}
    >
      <i className="ti ti-plus" style={{ fontSize: '13px' }} aria-hidden="true"></i>
      <span>Nuevo curso</span>
    </div>
  </div>
)}

        <div style={{ height: '1px', background: 'var(--sidebar-border)', margin: '8px 16px' }}></div>

        {/* Navegación del curso activo */}
        <div style={{ padding: '0 8px', overflowY: 'auto', flex: 1 }}>
          {NAV_ITEMS
            .filter(item => !item.adminOnly || isAdmin)
            .map(item => {
              const isActive = currentSection === item.key && !!activeCourseId && !isUnifiedCalendar
              return (
                <div
                  key={item.key}
                  onClick={() => navigate(item.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '7px 10px', borderRadius: '8px', cursor: 'pointer',
                    color: isActive ? 'var(--accent-light)' : 'var(--sidebar-text)',
                    background: isActive ? 'rgba(99,102,241,0.18)' : 'transparent',
                    fontSize: '13px', marginBottom: '1px',
                  }}
                >
                  <i className={`ti ${item.icon}`} style={{ fontSize: '16px', width: '18px' }} aria-hidden="true"></i>
                  {item.label}
                </div>
              )
            })
          }
        </div>

        {/* Usuario — menú desplegable */}
        <div style={{ borderTop: '1px solid var(--sidebar-border)', padding: '8px', position: 'relative' }}>
          {/* Menú desplegable (se abre hacia arriba) */}
          {userMenuOpen && (
            <>
              {/* Capa para cerrar al hacer click afuera */}
              <div onClick={() => setUserMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
              <div style={{
                position: 'absolute', bottom: 'calc(100% - 4px)', left: '8px', right: '8px',
                background: 'var(--surface-elevated)', border: '1px solid var(--sidebar-border)',
                borderRadius: '10px', padding: '4px', zIndex: 41,
                boxShadow: '0 -4px 16px rgba(0,0,0,0.3)',
              }}>
                <div
                  onClick={() => { setUserMenuOpen(false); router.push('/profile') }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '8px 10px', borderRadius: '7px', cursor: 'pointer',
                    color: 'var(--sidebar-text)', fontSize: '13px',
                  }}
                >
                  <i className="ti ti-user" style={{ fontSize: '15px', width: '18px' }} aria-hidden="true"></i>
                  Mi perfil
                </div>
                {isAdmin && (
                  <div
                    onClick={() => { setUserMenuOpen(false); router.push('/archived') }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '8px 10px', borderRadius: '7px', cursor: 'pointer',
                      color: 'var(--sidebar-text)', fontSize: '13px',
                    }}
                  >
                    <i className="ti ti-archive" style={{ fontSize: '15px', width: '18px' }} aria-hidden="true"></i>
                    Cursos archivados
                  </div>
                )}
                <div
                  onClick={handleLogout}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '8px 10px', borderRadius: '7px', cursor: 'pointer',
                    color: 'var(--sidebar-text)', fontSize: '13px',
                  }}
                >
                  <i className="ti ti-logout" style={{ fontSize: '15px', width: '18px' }} aria-hidden="true"></i>
                  Cerrar sesión
                </div>
              </div>
            </>
          )}

          {/* Botón de usuario (abre el menú) */}
          <div
            onClick={() => setUserMenuOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '6px 8px', borderRadius: '8px', cursor: 'pointer',
              background: userMenuOpen ? 'rgba(255,255,255,0.04)' : 'transparent',
            }}
          >
            <div style={{
              width: '28px', height: '28px', borderRadius: '50%',
              background: getColor(profile.id), color: 'white',
              fontSize: '11px', fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              {getInitials(profile.full_name)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '12px', color: 'var(--sidebar-active)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {profile.full_name}
              </p>
              <span style={{ fontSize: '10px', color: 'var(--sidebar-text)' }}>{roleLabel}</span>
            </div>
            <i className="ti ti-selector" style={{ color: '#555575', fontSize: '15px', flexShrink: 0 }} aria-hidden="true"></i>
          </div>
        </div>
      </nav>
    </>
  )
}
