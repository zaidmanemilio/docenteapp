'use client'
// src/app/(app)/courses/[courseId]/users/page.tsx
// Fix: muestra todos los profiles existentes, con botón de sincronización

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile, Commission } from '@/types'

interface Permission {
  id: string
  user_id: string
  course_id: string
  commission_id: string | null
  permission: string
  profiles: Profile | null
}

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}
const COLORS = ['#6366f1','#0d9488','#be185d','#d97706','#059669','#6b7280']
function getColor(id: string) {
  let n = 0; for (const c of id) n += c.charCodeAt(0)
  return COLORS[n % COLORS.length]
}

// Normaliza texto para búsqueda: minúsculas, sin espacios extremos y sin
// diacríticos/acentos. Reutilizable para nombre, apellido, email y DNI.
// "Pérez" -> "perez", "JOSÉ" -> "jose", "  Martín " -> "martin".
function normalizeForSearch(s: string): string {
  return (s || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')               // separa la letra del acento
    .replace(/[\u0300-\u036f]/g, '') // elimina los diacríticos
}

// Escapa un valor para CSV: comillas dobles y separadores.
function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value)
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export default function UsersPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const supabase = createClient()

  const [myProfile,    setMyProfile]    = useState<Profile | null>(null)
  const [allProfiles,  setAllProfiles]  = useState<Profile[]>([])
  const [commissions,  setCommissions]  = useState<Commission[]>([])
  const [permissions,  setPermissions]  = useState<Permission[]>([])
  const [loading,      setLoading]      = useState(true)
  const [syncing,      setSyncing]      = useState(false)
  const [tab,          setTab]          = useState<'by-course'|'by-user'>('by-course')
  const [syncMsg,      setSyncMsg]      = useState('')
  const [userSearch,   setUserSearch]   = useState('')

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [myProfileRes, allProfilesRes, commsRes, permsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('commissions').select('*').eq('course_id', courseId),
      supabase.from('user_course_permissions')
        .select('*, profiles(*)')
        .eq('course_id', courseId),
    ])
    setMyProfile(myProfileRes.data)
    setAllProfiles(allProfilesRes.data || [])
    setCommissions(commsRes.data || [])
    setPermissions(permsRes.data || [])
    setLoading(false)
  }, [courseId])

  useEffect(() => { load() }, [load])

  const isAdmin = myProfile?.global_role === 'admin'

  // Sincronizar usuarios de auth.users que no tienen profile
  async function syncUsers() {
    setSyncing(true)
    setSyncMsg('')
    const { error } = await supabase.rpc('sync_missing_profiles')
    if (error) {
      // Si no existe la función RPC, hacer la sincronización básica
      // Recargar perfiles después de la sincronización manual desde Supabase
      setSyncMsg('Si faltan usuarios, ejecutá el SQL de sincronización en Supabase y recargá esta página.')
    } else {
      setSyncMsg('Sincronización completada.')
    }
    setSyncing(false)
    load()
  }

  async function addPermission(userId: string) {
    const perm = prompt('Permiso para este usuario en el curso (full / edit / read):')
    if (!['full','edit','read'].includes(perm || '')) { alert('Permiso inválido.'); return }
    await supabase.from('user_course_permissions').upsert({
      user_id: userId, course_id: courseId, commission_id: null, permission: perm
    }, { onConflict: 'user_id,course_id,commission_id' })
    load()
  }

  async function changePerm(id: string, perm: string) {
    await supabase.from('user_course_permissions').update({ permission: perm }).eq('id', id)
    load()
  }

  async function removePerm(id: string) {
    if (!confirm('¿Quitar este permiso?')) return
    await supabase.from('user_course_permissions').delete().eq('id', id)
    load()
  }

  // Lista de usuarios filtrada por la búsqueda normalizada (sin mayúsculas ni
  // acentos). Hoy busca en nombre y rol; cuando existan email/apellido/DNI en
  // el modelo (sub-paso siguiente), se agregan a este mismo arreglo.
  const q = normalizeForSearch(userSearch)
  const filteredProfiles = !q ? allProfiles : allProfiles.filter(u => {
    const haystack = [u.full_name, u.global_role].map(normalizeForSearch)
    return haystack.some(h => h.includes(q))
  })

  // Exporta todos los usuarios a CSV con sus permisos por curso.
  // Nunca incluye passwords, hashes ni tokens (solo datos administrativos).
  function exportUsersCSV() {
    const permsByUser: Record<string, string[]> = {}
    permissions.forEach(p => {
      const com = p.commission_id ? commissions.find(c => c.id === p.commission_id) : null
      const label = `${com?.name || 'Todas'}:${p.permission}`
      ;(permsByUser[p.user_id] ||= []).push(label)
    })

    const headers = ['nombre', 'rol_global', 'permisos_curso']
    const rows = allProfiles.map(u => [
      csvCell(u.full_name),
      csvCell(u.global_role),
      csvCell((permsByUser[u.id] || []).join('; ')),
    ].join(','))

    const csv = [headers.join(','), ...rows].join('\n')
    // BOM para que Excel respete acentos
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `usuarios_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div style={{ padding: '24px', color: 'var(--text-muted)' }}>Cargando...</div>

  if (!isAdmin) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
        <i className="ti ti-lock" style={{ fontSize: '40px', opacity: 0.4, display: 'block', marginBottom: '12px' }}></i>
        <p>Solo los administradores pueden gestionar usuarios y permisos.</p>
      </div>
    </div>
  )

  const tabStyle = (t: string): React.CSSProperties => ({
    padding: '8px 16px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
    color: tab === t ? 'var(--accent)' : 'var(--text-muted)',
    borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
    marginBottom: '-1px', background: 'none', border: 'none', fontFamily: 'inherit',
    borderBottomStyle: 'solid' as const,
  })

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.8.0/tabler-icons.min.css" />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Usuarios y permisos</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={exportUsersCSV} style={{
            padding: '7px 14px', background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
            color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <i className="ti ti-download" aria-hidden="true"></i>
            Exportar CSV
          </button>
          <button onClick={syncUsers} disabled={syncing} style={{
            padding: '7px 14px', background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
            color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px',
            opacity: syncing ? 0.6 : 1,
          }}>
            <i className="ti ti-refresh" aria-hidden="true"></i>
            {syncing ? 'Sincronizando...' : 'Sincronizar usuarios'}
          </button>
        </div>
      </div>

      {syncMsg && (
        <div className="alert alert-success" style={{ padding: '10px 14px', borderRadius: '8px', fontSize: '12px', marginBottom: '16px' }}>
          {syncMsg}
        </div>
      )}

      {/* Info sobre sincronización */}
      <div style={{ padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <i className="ti ti-info-circle" style={{ fontSize: '15px', flexShrink: 0 }} aria-hidden="true"></i>
        <span>
          Si un usuario puede loguearse pero no aparece acá, ejecutá este SQL en Supabase y presioná &quot;Sincronizar usuarios&quot;:
          <br />
          <code style={{ fontSize: '11px', background: 'var(--hover-bg)', padding: '2px 6px', borderRadius: '4px', marginTop: '4px', display: 'inline-block' }}>
            insert into public.profiles (id, full_name, global_role) select id, coalesce(raw_user_meta_data-&gt;&gt;&apos;full_name&apos;, email), coalesce(raw_user_meta_data-&gt;&gt;&apos;global_role&apos;, &apos;teacher&apos;) from auth.users where id not in (select id from public.profiles) on conflict (id) do nothing;
          </code>
        </span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '20px' }}>
        <button style={tabStyle('by-course')} onClick={() => setTab('by-course')}>Permisos de este curso</button>
        <button style={tabStyle('by-user')}   onClick={() => setTab('by-user')}>Todos los usuarios</button>
      </div>

      {/* TAB: Permisos del curso */}
      {tab === 'by-course' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
          {permissions.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No hay permisos asignados a este curso todavía.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--hover-bg)' }}>
                  {['Usuario','Comisión','Permiso',''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 16px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {permissions.map(p => {
                  const u = p.profiles as Profile | null
                  const com = p.commission_id ? commissions.find(c => c.id === p.commission_id) : null
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {u && (
                            <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: getColor(u.id), color: 'white', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {getInitials(u.full_name)}
                            </div>
                          )}
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 500 }}>{u?.full_name || p.user_id}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{u?.global_role === 'admin' ? 'Administrador' : u?.global_role === 'teacher' ? 'Docente' : 'Invitado'}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: '13px', color: 'var(--text-muted)' }}>
                        {com ? <span className="badge badge-success" style={{ fontSize: '11px' }}>{com.name}</span> : <span style={{ color: 'var(--text-muted)' }}>Todas</span>}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <select value={p.permission} onChange={e => changePerm(p.id, e.target.value)}
                          style={{ padding: '4px 8px', border: '1px solid var(--input-border)', borderRadius: '6px', fontSize: '12px', fontFamily: 'inherit' }}>
                          <option value="full">full</option>
                          <option value="edit">edit</option>
                          <option value="read">read</option>
                        </select>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <button onClick={() => removePerm(p.id)} style={{ background: 'none', border: '1px solid var(--badge-danger-bd)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: 'var(--danger)', fontSize: '12px' }}>
                          <i className="ti ti-trash" aria-hidden="true"></i>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* TAB: Todos los usuarios */}
      {tab === 'by-user' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '4px 20px' }}>
          <div style={{ padding: '14px 0 10px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ position: 'relative' }}>
              <i className="ti ti-search" aria-hidden="true" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '14px' }}></i>
              <input
                type="text"
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                placeholder="Buscar por nombre o rol..."
                style={{ width: '100%', padding: '8px 10px 8px 32px', border: '1px solid var(--input-border)', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }}
              />
            </div>
          </div>
          {allProfiles.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No hay usuarios en el sistema. Sincronizá para traerlos.
            </div>
          ) : filteredProfiles.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Ningún usuario coincide con &quot;{userSearch}&quot;.
            </div>
          ) : filteredProfiles.map(u => {
            const userPerms = permissions.filter(p => p.user_id === u.id)
            const permCls: Record<string, string> = { full: 'badge-accent', edit: 'badge-info', read: 'badge-neutral' }
            return (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: getColor(u.id), color: 'white', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {getInitials(u.full_name)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: '13px' }}>{u.full_name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {u.global_role === 'admin' ? 'Administrador' : u.global_role === 'teacher' ? 'Docente' : 'Invitado'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {userPerms.length === 0 ? (
                    <>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Sin acceso a este curso</span>
                      <button onClick={() => addPermission(u.id)} className="chip-accent" style={{
                        marginLeft: '8px', padding: '3px 10px', fontSize: '11px', borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit',
                      }}>
                        + Dar acceso
                      </button>
                    </>
                  ) : userPerms.map(p => {
                    const com = p.commission_id ? commissions.find(c => c.id === p.commission_id) : null
                    const pc = permCls[p.permission] || permCls.read
                    return (
                      <span key={p.id} className={`badge ${pc}`} style={{ fontSize: '10px' }}>
                        {com?.name || 'Todas'} · {p.permission}
                      </span>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
