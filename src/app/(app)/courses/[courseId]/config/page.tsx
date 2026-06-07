'use client'
// src/app/(app)/courses/[courseId]/config/page.tsx

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Course, Commission, Profile } from '@/types'

interface Permission {
  id: string; user_id: string; commission_id: string | null; permission: string
  profiles: { full_name: string; global_role: string } | null
}
interface AllProfile { id: string; full_name: string; global_role: string }

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 600,
  color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px',
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb',
  borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', color: '#111827',
}

export default function ConfigPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [course, setCourse] = useState<Course & {
    full_name?: string; career?: string; faculty?: string
    schedule_text?: string; zoom_url?: string; program_url?: string
    moodle_url?: string; materials_url?: string; modality?: string; internal_notes?: string
  } | null>(null)
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [allProfiles, setAllProfiles] = useState<AllProfile[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [tab, setTab] = useState<'general' | 'links' | 'commissions' | 'teachers'>('general')

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [profileRes, courseRes, commsRes, permsRes, allProfilesRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('courses').select('*').eq('id', courseId).single(),
      supabase.from('commissions').select('*').eq('course_id', courseId),
      supabase.from('user_course_permissions')
        .select('id, user_id, commission_id, permission, profiles(full_name, global_role)')
        .eq('course_id', courseId),
      supabase.from('profiles').select('id, full_name, global_role').order('full_name'),
    ])
    setProfile(profileRes.data)
    setCourse(courseRes.data)
    setCommissions(commsRes.data || [])
    setPermissions(permsRes.data || [])
    setAllProfiles(allProfilesRes.data || [])
    setLoading(false)
  }, [courseId])

  useEffect(() => { load() }, [load])

  const isAdmin = profile?.global_role === 'admin'

  async function saveCourse() {
    if (!course) return
    setSaving(true)
    await supabase.from('courses').update({
      name: course.name,
      full_name: course.full_name || '',
      career: course.career || '',
      faculty: course.faculty || '',
      description: course.description || '',
      status: course.status,
      expected_sessions: course.expected_sessions,
      year: course.year,
      modality: course.modality || 'presencial',
      schedule_text: course.schedule_text || '',
      zoom_url: course.zoom_url || '',
      program_url: course.program_url || '',
      moodle_url: course.moodle_url || '',
      materials_url: course.materials_url || '',
      internal_notes: course.internal_notes || '',
    }).eq('id', courseId)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    router.refresh()
  }

  async function archiveCourse() {
    if (!confirm('¿Archivar este curso? No va a aparecer en el menú principal. Podés restaurarlo desde "Cursos archivados".')) return
    await supabase.from('courses').update({ status: 'archived' }).eq('id', courseId)
    router.push('/')
    router.refresh()
  }

  async function addCommission() {
    const name = prompt('Nombre de la nueva comisión:')
    if (!name) return
    await supabase.from('commissions').insert({ course_id: courseId, name, description: '' })
    load()
  }

  async function editCommission(c: Commission) {
    const name = prompt('Nombre:', c.name)
    if (!name || name === c.name) return
    await supabase.from('commissions').update({ name }).eq('id', c.id)
    load()
  }

  async function deleteCommission(id: string) {
    if (!confirm('¿Eliminar esta comisión?')) return
    await supabase.from('commissions').delete().eq('id', id)
    load()
  }

  async function addPermission() {
    const userId = prompt('UUID del usuario (copialo de Supabase Auth → Users):')
    if (!userId) return
    const perm = prompt('Permiso (full / edit / read):')
    if (!['full', 'edit', 'read'].includes(perm || '')) { alert('Permiso inválido.'); return }
    await supabase.from('user_course_permissions').upsert({
      user_id: userId, course_id: courseId, commission_id: null, permission: perm
    }, { onConflict: 'user_id,course_id,commission_id' })
    load()
  }

  async function changePermission(id: string, perm: string) {
    await supabase.from('user_course_permissions').update({ permission: perm }).eq('id', id)
    load()
  }

  async function removePermission(id: string) {
    if (!confirm('¿Quitar este permiso?')) return
    await supabase.from('user_course_permissions').delete().eq('id', id)
    load()
  }

  if (loading || !course) return <div style={{ padding: '24px', color: '#6b7280' }}>Cargando...</div>

  const tabStyle = (t: string): React.CSSProperties => ({
    padding: '8px 14px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
    color: tab === t ? '#6366f1' : '#6b7280',
    borderBottom: tab === t ? '2px solid #6366f1' : '2px solid transparent',
    marginBottom: '-1px', background: 'none', border: 'none', fontFamily: 'inherit',
    borderBottomStyle: 'solid',
  })

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.8.0/tabler-icons.min.css" />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '2px' }}>{course.name}</p>
          <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Configuración del curso</h2>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {isAdmin && (
            <button onClick={archiveCourse} style={{
              padding: '7px 14px', background: 'transparent', border: '1px solid #d1d5db',
              borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
              color: '#6b7280', display: 'flex', alignItems: 'center', gap: '5px',
            }}>
              <i className="ti ti-archive" aria-hidden="true"></i> Archivar
            </button>
          )}
          {isAdmin && (
            <button onClick={saveCourse} disabled={saving} style={{
              padding: '7px 16px', background: saving ? '#9ca3af' : '#6366f1',
              color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px',
              fontWeight: 500, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: '5px',
            }}>
              {saved ? <><i className="ti ti-check" aria-hidden="true"></i> Guardado</> : <><i className="ti ti-device-floppy" aria-hidden="true"></i> Guardar</>}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: '20px' }}>
        <button style={tabStyle('general')} onClick={() => setTab('general')}>General</button>
        <button style={tabStyle('links')} onClick={() => setTab('links')}>Links del curso</button>
        <button style={tabStyle('commissions')} onClick={() => setTab('commissions')}>Comisiones</button>
        <button style={tabStyle('teachers')} onClick={() => setTab('teachers')}>Docentes y permisos</button>
      </div>

      <div style={{ maxWidth: '620px' }}>

        {/* TAB: General */}
        {tab === 'general' && (
          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px' }}>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Nombre corto del curso</label>
              <input value={course.name} onChange={e => setCourse({ ...course, name: e.target.value })}
                disabled={!isAdmin} style={inputStyle} />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Nombre completo de la materia</label>
              <input value={course.full_name || ''} onChange={e => setCourse({ ...course, full_name: e.target.value })}
                disabled={!isAdmin} placeholder="Nombre oficial de la materia" style={inputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={labelStyle}>Carrera</label>
                <input value={course.career || ''} onChange={e => setCourse({ ...course, career: e.target.value })}
                  disabled={!isAdmin} placeholder="Ej: Ing. en Sistemas" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Año</label>
                <input type="number" value={course.year}
                  onChange={e => setCourse({ ...course, year: parseInt(e.target.value) })}
                  disabled={!isAdmin} style={inputStyle} />
              </div>
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Facultad / Universidad</label>
              <input value={course.faculty || ''} onChange={e => setCourse({ ...course, faculty: e.target.value })}
                disabled={!isAdmin} placeholder="Ej: UNLP - Informática" style={inputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={labelStyle}>Modalidad predominante</label>
                <select value={course.modality || 'presencial'}
                  onChange={e => setCourse({ ...course, modality: e.target.value })}
                  disabled={!isAdmin} style={inputStyle}>
                  <option value="presencial">Presencial</option>
                  <option value="virtual">Virtual</option>
                  <option value="hibrida">Híbrida</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Encuentros esperados</label>
                <input type="number" value={course.expected_sessions}
                  onChange={e => setCourse({ ...course, expected_sessions: parseInt(e.target.value) })}
                  disabled={!isAdmin} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={labelStyle}>Estado</label>
                <select value={course.status}
                  onChange={e => setCourse({ ...course, status: e.target.value as Course['status'] })}
                  disabled={!isAdmin} style={inputStyle}>
                  <option value="draft">Borrador</option>
                  <option value="active">Activo</option>
                  <option value="closed">Cerrado</option>
                </select>
              </div>
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Días y horarios</label>
              <input value={course.schedule_text || ''} onChange={e => setCourse({ ...course, schedule_text: e.target.value })}
                disabled={!isAdmin} placeholder="Ej: Martes 18-21hs y Jueves 18-21hs" style={inputStyle} />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Descripción</label>
              <textarea value={course.description || ''}
                onChange={e => setCourse({ ...course, description: e.target.value })}
                disabled={!isAdmin} rows={3}
                style={{ ...inputStyle, resize: 'vertical', minHeight: '72px' }} />
            </div>
            <div>
              <label style={labelStyle}>Observaciones internas</label>
              <textarea value={course.internal_notes || ''}
                onChange={e => setCourse({ ...course, internal_notes: e.target.value })}
                disabled={!isAdmin} rows={2} placeholder="Notas visibles solo para el equipo docente..."
                style={{ ...inputStyle, resize: 'vertical', minHeight: '56px' }} />
            </div>
          </div>
        )}

        {/* TAB: Links */}
        {tab === 'links' && (
          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px' }}>
            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '20px' }}>
              Links generales del curso. El link de Zoom aparece en el cronograma para encuentros virtuales sin link específico.
            </p>
            {[
              { key: 'zoom_url', label: 'Link general de Zoom', placeholder: 'https://zoom.us/j/...', icon: '📹' },
              { key: 'program_url', label: 'Programa de la materia', placeholder: 'https://drive.google.com/...', icon: '📄' },
              { key: 'moodle_url', label: 'Aula virtual / Moodle', placeholder: 'https://campus.edu.ar/...', icon: '🎓' },
              { key: 'materials_url', label: 'Carpeta de materiales', placeholder: 'https://drive.google.com/...', icon: '📁' },
            ].map(({ key, label, placeholder, icon }) => (
              <div key={key} style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>{icon} {label}</label>
                <input
                  value={(course as Record<string, unknown>)[key] as string || ''}
                  onChange={e => setCourse({ ...course, [key]: e.target.value })}
                  disabled={!isAdmin} placeholder={placeholder} style={inputStyle}
                />
              </div>
            ))}
          </div>
        )}

        {/* TAB: Comisiones */}
        {tab === 'commissions' && (
          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px' }}>
            {commissions.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
                <i className="ti ti-users" style={{ color: '#6366f1', fontSize: '16px' }} aria-hidden="true"></i>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: '13px' }}>{c.name}</div>
                  {c.description && <div style={{ fontSize: '12px', color: '#6b7280' }}>{c.description}</div>}
                </div>
                {isAdmin && (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => editCommission(c)} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: '#6b7280', fontSize: '12px' }}>
                      <i className="ti ti-pencil" aria-hidden="true"></i>
                    </button>
                    <button onClick={() => deleteCommission(c.id)} style={{ background: 'none', border: '1px solid #fca5a5', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: '#dc2626', fontSize: '12px' }}>
                      <i className="ti ti-trash" aria-hidden="true"></i>
                    </button>
                  </div>
                )}
              </div>
            ))}
            {isAdmin && (
              <button onClick={addCommission} style={{ marginTop: '12px', background: 'none', border: '1px dashed #d1d5db', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', color: '#6b7280', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'inherit' }}>
                <i className="ti ti-plus" aria-hidden="true"></i> Agregar comisión
              </button>
            )}
          </div>
        )}

        {/* TAB: Docentes y permisos */}
        {tab === 'teachers' && (
          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px' }}>
            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
              Docentes con acceso a este curso. El permiso <strong>full</strong> permite eliminar encuentros. <strong>edit</strong> permite editar. <strong>read</strong> es solo lectura.
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Docente', 'Comisión', 'Permiso', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '7px 10px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {permissions.map(p => {
                  const u = p.profiles as { full_name: string; global_role: string } | null
                  const com = p.commission_id ? commissions.find(c => c.id === p.commission_id) : null
                  const permColors: Record<string, { bg: string; color: string }> = {
                    full: { bg: '#ede9fe', color: '#7c3aed' },
                    edit: { bg: '#dbeafe', color: '#1d4ed8' },
                    read: { bg: '#f3f4f6', color: '#6b7280' },
                  }
                  const pc = permColors[p.permission] || permColors.read
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '9px 10px' }}>
                        <span style={{ fontWeight: 500 }}>{u?.full_name || '—'}</span>
                      </td>
                      <td style={{ padding: '9px 10px', color: '#6b7280' }}>
                        {com ? com.name : <span style={{ color: '#9ca3af' }}>Todas</span>}
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        {isAdmin ? (
                          <select value={p.permission} onChange={e => changePermission(p.id, e.target.value)}
                            style={{ padding: '3px 7px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '12px', fontFamily: 'inherit' }}>
                            <option value="full">full</option>
                            <option value="edit">edit</option>
                            <option value="read">read</option>
                          </select>
                        ) : (
                          <span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: 600, background: pc.bg, color: pc.color }}>
                            {p.permission}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        {isAdmin && (
                          <button onClick={() => removePermission(p.id)} style={{ background: 'none', border: '1px solid #fca5a5', borderRadius: '6px', padding: '3px 7px', cursor: 'pointer', color: '#dc2626', fontSize: '12px' }}>
                            <i className="ti ti-trash" aria-hidden="true"></i>
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {isAdmin && (
              <button onClick={addPermission} style={{ marginTop: '14px', background: 'none', border: '1px dashed #d1d5db', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', color: '#6b7280', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'inherit' }}>
                <i className="ti ti-user-plus" aria-hidden="true"></i> Agregar docente
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
