'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile, Course } from '@/types'

interface SidebarProps {
  profile: Profile
  courses: Course[]
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
  let n = 0; for (const c of id) n += c.charCodeAt(0)
  return AVATAR_COLORS[n % AVATAR_COLORS.length]
}

export default function Sidebar({ profile, courses }: SidebarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  const courseIdFromPath = pathname.split('/')[3] || courses[0]?.id || ''
  const [activeCourse, setActiveCourse] = useState(courseIdFromPath)
  const currentSection = pathname.split('/')[4] || 'dashboard'

  function navigate(section: string) {
    if (!activeCourse) return
    router.push(`/courses/${activeCourse}/${section}`)
  }

  function selectCourse(cid: string) {
    setActiveCourse(cid)
    router.push(`/courses/${cid}/dashboard`)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const roleLabel = profile.global_role === 'admin' ? 'Administrador'
    : profile.global_role === 'teacher' ? 'Docente' : 'Invitado'

  const isAdmin = profile.global_role === 'admin'

  return (
    <>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.8.0/tabler-icons.min.css" />
      <nav style={{
        width: '220px', background: '#1a1a2e',
        borderRight: '1px solid #2d2d4e',
        display: 'flex', flexDirection: 'column',
        flexShrink: 0, overflow: 'hidden',
      }}>
        {/* Logo */}
        <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid #2d2d4e' }}>
          <h1 style={{ fontSize: '13px', fontWeight: 600, color: '#fff', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            DocenteApp
          </h1>
          <p style={{ fontSize: '11px', color: '#a0a0c0', marginTop: '2px' }}>Gestión docente</p>
        </div>

        {/* Cursos */}
        <p style={{ padding: '14px 16px 6px', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#555575' }}>
          Mis cursos
        </p>
        <div style={{ padding: '0 8px', overflowY: 'auto', maxHeight: '200px' }}>
          {courses.map(c => (
            <div
              key={c.id}
              onClick={() => selectCourse(c.id)}
              style={{
                padding: '7px 10px', borderRadius: '8px', cursor: 'pointer',
                marginBottom: '2px',
                color: activeCourse === c.id ? '#818cf8' : '#a0a0c0',
                background: activeCourse === c.id ? 'rgba(99,102,241,0.18)' : 'transparent',
                fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px', lineHeight: '1.3',
              }}
            >
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor', flexShrink: 0 }}></span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
            </div>
          ))}

          {/* Crear nuevo curso (solo admin) */}
          {isAdmin && (
            <div
              onClick={() => router.push('/courses/new')}
              style={{
                padding: '7px 10px', borderRadius: '8px', cursor: 'pointer',
                marginBottom: '2px', marginTop: '4px',
                color: pathname === '/courses/new' ? '#818cf8' : '#555575',
                background: pathname === '/courses/new' ? 'rgba(99,102,241,0.18)' : 'transparent',
                fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px',
                borderTop: '1px solid #2d2d4e', paddingTop: '10px',
              }}
            >
              <i className="ti ti-plus" style={{ fontSize: '13px' }} aria-hidden="true"></i>
              <span>Nuevo curso</span>
            </div>
          )}
        </div>

        <div style={{ height: '1px', background: '#2d2d4e', margin: '8px 16px' }}></div>

        {/* Nav items */}
        <div style={{ padding: '0 8px', overflowY: 'auto', flex: 1 }}>
          {NAV_ITEMS
            .filter(item => !item.adminOnly || isAdmin)
            .map(item => (
              <div
                key={item.key}
                onClick={() => navigate(item.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '7px 10px', borderRadius: '8px', cursor: 'pointer',
                  color: currentSection === item.key ? '#818cf8' : '#a0a0c0',
                  background: currentSection === item.key ? 'rgba(99,102,241,0.18)' : 'transparent',
                  fontSize: '13px', marginBottom: '1px',
                }}
              >
                <i className={`ti ${item.icon}`} style={{ fontSize: '16px', width: '18px' }} aria-hidden="true"></i>
                {item.label}
              </div>
            ))
          }

          {/* Cursos archivados (solo admin) */}
          {isAdmin && (
            <>
              <div style={{ height: '1px', background: '#2d2d4e', margin: '8px 4px' }}></div>
              <div
                onClick={() => router.push('/archived')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '7px 10px', borderRadius: '8px', cursor: 'pointer',
                  color: pathname === '/archived' ? '#818cf8' : '#555575',
                  background: pathname === '/archived' ? 'rgba(99,102,241,0.18)' : 'transparent',
                  fontSize: '12px', marginBottom: '1px',
                }}
              >
                <i className="ti ti-archive" style={{ fontSize: '15px', width: '18px' }} aria-hidden="true"></i>
                Cursos archivados
              </div>
            </>
          )}
        </div>

        {/* User */}
        <div style={{ borderTop: '1px solid #2d2d4e', padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '50%',
              background: getColor(profile.id), color: 'white',
              fontSize: '11px', fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              {getInitials(profile.full_name)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '12px', color: '#e8e8f0', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {profile.full_name}
              </p>
              <span style={{ fontSize: '10px', color: '#a0a0c0' }}>{roleLabel}</span>
            </div>
            <button
              onClick={handleLogout}
              title="Cerrar sesión"
              style={{ background: 'none', border: 'none', color: '#555575', cursor: 'pointer', fontSize: '16px', padding: '2px' }}
            >
              <i className="ti ti-logout" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      </nav>
    </>
  )
}
