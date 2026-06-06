'use client'
// src/app/(app)/courses/[courseId]/users/page.tsx

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile, Commission, UserCoursePermission } from '@/types'

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}
const COLORS = ['#6366f1','#0d9488','#be185d','#d97706','#059669','#6b7280']
function getColor(id: string) {
  let n = 0; for (const c of id) n += c.charCodeAt(0)
  return COLORS[n % COLORS.length]
}

export default function UsersPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const supabase = createClient()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [allProfiles, setAllProfiles] = useState<Profile[]>([])
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [permissions, setPermissions] = useState<UserCoursePermission[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'by-course' | 'by-user'>('by-course')

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [myProfileRes, allProfilesRes, commsRes, permsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('commissions').select('*').eq('course_id', courseId),
      supabase.from('user_course_permissions').select('*, profiles(*)').eq('course_id', courseId),
    ])
    setProfile(myProfileRes.data)
    setAllProfiles(allProfilesRes.data || [])
    setCommissions(commsRes.data || [])
    setPermissions(permsRes.data || [])
    setLoading(false)
  }, [courseId])

  useEffect(() => { load() }, [load])

  const isAdmin = profile?.global_role === 'admin'

  async function addPermission() {
    const userId = prompt('UUID del usuario a agregar (copialo desde Supabase Auth):')
    if (!userId) return
    const perm = prompt('Permiso: full / edit / read')
    if (!['full','edit','read'].includes(perm || '')) { alert('Permiso inválido.'); return }
    const commName = prompt('Nombre de comisión (dejá vacío para todas):')
    let commissionId: string | null = null
    if (commName) {
      const com = commissions.find(c => c.name.toLowerCase().includes(commName.toLowerCase()))
      if (!com) { alert('Comisión no encontrada.'); return }
      commissionId = com.id
    }
    await supabase.from('user_course_permissions').upsert({
      user_id: userId, course_id: courseId, commission_id: commissionId, permission: perm
    }, { onConflict: 'user_id,course_id,commission_id' })
    load()
  }

  async function removePerm(id: string) {
    if (!confirm('¿Quitar este permiso?')) return
    await supabase.from('user_course_permissions').delete().eq('id', id)
    load()
  }

  async function changePerm(id: string, perm: string) {
    await supabase.from('user_course_permissions').update({ permission: perm }).eq('id', id)
    load()
  }

  if (loading) return <div style={{ padding: '24px', color: '#6b7280' }}>Cargando...</div>

  if (!isAdmin) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: '#6b7280' }}>
        <i className="ti ti-lock" style={{ fontSize: '40px', opacity: 0.4, display: 'block', marginBottom: '12px' }}></i>
        <p>Solo los administradores pueden gestionar usuarios y permisos.</p>
      </div>
    </div>
  )

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.8.0/tabler-icons.min.css" />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Usuarios y permisos</h2>
        <button onClick={addPermission} style={{ padding: '8px 16px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <i className="ti ti-user-plus" aria-hidden="true"></i> Agregar permiso
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: '20px' }}>
        {[['by-course','Permisos de este curso'],['by-user','Todos los usuarios']].map(([key, label]) => (
          <div key={key} onClick={() => setTab(key as typeof tab)} style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', color: tab === key ? '#6366f1' : '#6b7280', borderBottom: tab === key ? '2px solid #6366f1' : '2px solid transparent', marginBottom: '-1px' }}>
            {label}
          </div>
        ))}
      </div>

      {tab === 'by-course' && (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
          {permissions.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af' }}>No hay permisos asignados a este curso todavía.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Usuario','Comisión','Permiso',''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 16px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {permissions.map(p => {
                  const u = p.profiles as unknown as Profile
                  const com = p.commission_id ? commissions.find(c => c.id === p.commission_id) : null
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {u && (
                            <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: getColor(u.id), color: 'white', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {getInitials(u.full_name)}
                            </div>
                          )}
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 500 }}>{u?.full_name || p.user_id}</div>
                            <div style={{ fontSize: '11px', color: '#6b7280' }}>{u?.global_role === 'admin' ? 'Administrador' : u?.global_role === 'teacher' ? 'Docente' : 'Invitado'}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: '13px', color: '#6b7280' }}>
                        {com ? <span style={{ padding: '2px 8px', borderRadius: '99px', background: '#f0fdf4', color: '#166534', fontSize: '11px' }}>{com.name}</span> : <span style={{ color: '#9ca3af' }}>Todas</span>}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <select value={p.permission} onChange={e => changePerm(p.id, e.target.value)} style={{ padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '12px', fontFamily: 'inherit' }}>
                          <option value="full">full</option>
                          <option value="edit">edit</option>
                          <option value="read">read</option>
                        </select>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <button onClick={() => removePerm(p.id)} style={{ background: 'none', border: '1px solid #fca5a5', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: '#dc2626', fontSize: '12px' }}>
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

      {tab === 'by-user' && (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '4px 20px' }}>
          {allProfiles.map(u => {
            const userPerms = permissions.filter(p => p.user_id === u.id)
            return (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: getColor(u.id), color: 'white', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {getInitials(u.full_name)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: '13px' }}>{u.full_name}</div>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>{u.global_role === 'admin' ? 'Administrador' : u.global_role === 'teacher' ? 'Docente' : 'Invitado'}</div>
                </div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {userPerms.length === 0 ? (
                    <span style={{ fontSize: '11px', color: '#9ca3af' }}>Sin acceso a este curso</span>
                  ) : userPerms.map(p => {
                    const com = p.commission_id ? commissions.find(c => c.id === p.commission_id) : null
                    const permColors: Record<string, {bg:string;color:string}> = {
                      full: { bg:'#ede9fe', color:'#7c3aed' },
                      edit: { bg:'#dbeafe', color:'#1d4ed8' },
                      read: { bg:'#f3f4f6', color:'#6b7280' },
                    }
                    const pc = permColors[p.permission] || permColors.read
                    return (
                      <span key={p.id} style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '10px', fontWeight: 500, background: pc.bg, color: pc.color }}>
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

      <div style={{ marginTop: '16px', padding: '12px 16px', background: '#f8f9fb', borderRadius: '8px', fontSize: '12px', color: '#6b7280' }}>
        <strong>Nota:</strong> Para invitar usuarios nuevos, creá sus cuentas en Supabase Auth (Authentication {'>'} Users {'>'} Add user) con nombre y contraseña, luego asignales permisos aquí.
      </div>
    </div>
  )
}
