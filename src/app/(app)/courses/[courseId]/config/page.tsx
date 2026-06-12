'use client'
// src/app/(app)/courses/[courseId]/config/page.tsx
// Fix: agregar docente usa select de usuarios reales, no prompt() con UUID

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Course, Commission, Profile } from '@/types'

interface Permission {
  id: string
  user_id: string
  commission_id: string | null
  permission: string
  profiles: { full_name: string; global_role: string } | null
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 600,
  color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px',
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid var(--input-border)',
  borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', color: 'var(--text-primary)',
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
  const [commissions,  setCommissions]  = useState<Commission[]>([])
  const [permissions,  setPermissions]  = useState<Permission[]>([])
  const [allProfiles,  setAllProfiles]  = useState<Profile[]>([])
  const [profile,      setProfile]      = useState<Profile | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [tab,          setTab]          = useState<'general'|'links'|'commissions'|'teachers'>('general')

  // Estado para el formulario de agregar docente
  const [addingTeacher,    setAddingTeacher]    = useState(false)
  const [newTeacherUserId, setNewTeacherUserId] = useState('')
  const [newTeacherCommId, setNewTeacherCommId] = useState('')  // '' = todas
  const [newTeacherPerm,   setNewTeacherPerm]   = useState('edit')

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
      name:              course.name,
      full_name:         course.full_name || '',
      career:            course.career || '',
      faculty:           course.faculty || '',
      description:       course.description || '',
      status:            course.status,
      expected_sessions: course.expected_sessions,
      year:              course.year,
      modality:          course.modality || 'presencial',
      level:             (course as Record<string, unknown>).level || 'grado',
      schedule_text:     course.schedule_text || '',
      zoom_url:          course.zoom_url || '',
      program_url:       course.program_url || '',
      moodle_url:        course.moodle_url || '',
      materials_url:     course.materials_url || '',
      internal_notes:    course.internal_notes || '',
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

  // Agregar docente — usa select de usuarios reales
  async function handleAddTeacher() {
    if (!newTeacherUserId) { alert('Seleccioná un usuario.'); return }
    const { error } = await supabase.from('user_course_permissions').upsert({
      user_id:       newTeacherUserId,
      course_id:     courseId,
      commission_id: newTeacherCommId || null,
      permission:    newTeacherPerm,
    }, { onConflict: 'user_id,course_id,commission_id' })

    if (error) {
      alert('Error al agregar: ' + error.message)
      return
    }
    // Resetear formulario y recargar
    setNewTeacherUserId('')
    setNewTeacherCommId('')
    setNewTeacherPerm('edit')
    setAddingTeacher(false)
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

  if (loading || !course) return <div style={{ padding: '24px', color: 'var(--text-muted)' }}>Cargando...</div>

  // Usuarios que ya tienen permiso en este curso (para no repetirlos en el select)
  const usersWithPerm = new Set(permissions.map(p => p.user_id))
  const availableProfiles = allProfiles.filter(p => !usersWithPerm.has(p.id))

  const tabStyle = (t: string): React.CSSProperties => ({
    padding: '8px 14px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
    color: tab === t ? 'var(--accent)' : 'var(--text-muted)',
    borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
    marginBottom: '-1px', background: 'none', border: 'none', fontFamily: 'inherit',
    borderBottomStyle: 'solid' as const,
  })

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.8.0/tabler-icons.min.css" />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '2px' }}>{course.name}</p>
          <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Configuración del curso</h2>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {isAdmin && (
            <button onClick={archiveCourse} style={{
              padding: '7px 14px', background: 'transparent', border: '1px solid var(--input-border)',
              borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
              color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px',
            }}>
              <i className="ti ti-archive" aria-hidden="true"></i> Archivar
            </button>
          )}
          {isAdmin && (
            <button onClick={saveCourse} disabled={saving} style={{
              padding: '7px 16px', background: saving ? 'var(--text-muted)' : 'var(--accent)',
              color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px',
              fontWeight: 500, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: '5px',
            }}>
              {saved
                ? <><i className="ti ti-check" aria-hidden="true"></i> Guardado</>
                : <><i className="ti ti-device-floppy" aria-hidden="true"></i> Guardar</>}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '20px' }}>
        <button style={tabStyle('general')}     onClick={() => setTab('general')}>General</button>
        <button style={tabStyle('links')}       onClick={() => setTab('links')}>Links del curso</button>
        <button style={tabStyle('commissions')} onClick={() => setTab('commissions')}>Comisiones</button>
        <button style={tabStyle('teachers')}    onClick={() => setTab('teachers')}>Docentes y permisos</button>
      </div>

      <div style={{ maxWidth: '620px' }}>

        {/* TAB: General */}
        {tab === 'general' && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' }}>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Nombre corto del curso</label>
              <input value={course.name} onChange={e => setCourse({...course, name: e.target.value})} disabled={!isAdmin} style={inputStyle} />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Nombre completo de la materia</label>
              <input value={course.full_name || ''} onChange={e => setCourse({...course, full_name: e.target.value})} disabled={!isAdmin} placeholder="Nombre oficial de la materia" style={inputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={labelStyle}>Carrera</label>
                <input value={course.career || ''} onChange={e => setCourse({...course, career: e.target.value})} disabled={!isAdmin} placeholder="Ej: Ing. en Sistemas" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Año</label>
                <input type="number" value={course.year} onChange={e => setCourse({...course, year: parseInt(e.target.value)})} disabled={!isAdmin} style={inputStyle} />
              </div>
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Facultad / Universidad</label>
              <input value={course.faculty || ''} onChange={e => setCourse({...course, faculty: e.target.value})} disabled={!isAdmin} placeholder="Ej: UNLP - Informática" style={inputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div style={{ marginBottom: '14px' }}>
  <label style={labelStyle}>Nivel académico</label>
  <select
    value={(course as Record<string, unknown>).level as string || 'grado'}
    onChange={e => setCourse({...course, level: e.target.value})}
    disabled={!isAdmin}
    style={inputStyle}
  >
    <option value="grado">Grado</option>
    <option value="posgrado">Posgrado</option>
  </select>
</div>
              <div>
                <label style={labelStyle}>Modalidad predominante</label>
                <select value={course.modality || 'presencial'} onChange={e => setCourse({...course, modality: e.target.value})} disabled={!isAdmin} style={inputStyle}>
                  <option value="presencial">Presencial</option>
                  <option value="virtual">Virtual</option>
                  <option value="hibrida">Híbrida</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Encuentros esperados</label>
                <input type="number" value={course.expected_sessions} onChange={e => setCourse({...course, expected_sessions: parseInt(e.target.value)})} disabled={!isAdmin} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={labelStyle}>Estado</label>
                <select value={course.status} onChange={e => setCourse({...course, status: e.target.value as Course['status']})} disabled={!isAdmin} style={inputStyle}>
                  <option value="draft">Borrador</option>
                  <option value="active">Activo</option>
                  <option value="closed">Cerrado</option>
                </select>
              </div>
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Días y horarios</label>
              <input value={course.schedule_text || ''} onChange={e => setCourse({...course, schedule_text: e.target.value})} disabled={!isAdmin} placeholder="Ej: Martes 18-21hs y Jueves 18-21hs" style={inputStyle} />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Descripción</label>
              <textarea value={course.description || ''} onChange={e => setCourse({...course, description: e.target.value})} disabled={!isAdmin} rows={3} style={{...inputStyle, resize: 'vertical', minHeight: '72px'}} />
            </div>
            <div>
              <label style={labelStyle}>Observaciones internas</label>
              <textarea value={course.internal_notes || ''} onChange={e => setCourse({...course, internal_notes: e.target.value})} disabled={!isAdmin} rows={2} placeholder="Notas visibles solo para el equipo docente..." style={{...inputStyle, resize: 'vertical', minHeight: '56px'}} />
            </div>
          </div>
        )}

        {/* TAB: Links */}
        {tab === 'links' && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
              Links generales del curso. El link de Zoom aparece en el cronograma para encuentros virtuales sin link específico.
            </p>
            {[
              { key: 'zoom_url',     label: '📹 Link general de Zoom',     placeholder: 'https://zoom.us/j/...' },
              { key: 'program_url',  label: '📄 Programa de la materia',   placeholder: 'https://drive.google.com/...' },
              { key: 'moodle_url',   label: '🎓 Aula virtual / Moodle',    placeholder: 'https://campus.edu.ar/...' },
              { key: 'materials_url',label: '📁 Carpeta de materiales',    placeholder: 'https://drive.google.com/...' },
            ].map(({ key, label, placeholder }) => (
              <div key={key} style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>{label}</label>
                <input
                  value={(course as Record<string, unknown>)[key] as string || ''}
                  onChange={e => setCourse({...course, [key]: e.target.value})}
                  disabled={!isAdmin} placeholder={placeholder} style={inputStyle}
                />
              </div>
            ))}
          </div>
        )}

        {/* TAB: Comisiones */}
        {tab === 'commissions' && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' }}>
            {commissions.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <i className="ti ti-users" style={{ color: 'var(--accent)', fontSize: '16px' }} aria-hidden="true"></i>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: '13px' }}>{c.name}</div>
                  {c.description && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{c.description}</div>}
                </div>
                {isAdmin && (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => editCommission(c)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '12px' }}>
                      <i className="ti ti-pencil" aria-hidden="true"></i>
                    </button>
                    <button onClick={() => deleteCommission(c.id)} style={{ background: 'none', border: '1px solid var(--badge-danger-bd)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: 'var(--danger)', fontSize: '12px' }}>
                      <i className="ti ti-trash" aria-hidden="true"></i>
                    </button>
                  </div>
                )}
              </div>
            ))}
            {isAdmin && (
              <button onClick={addCommission} style={{ marginTop: '12px', background: 'none', border: '1px dashed var(--input-border)', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'inherit' }}>
                <i className="ti ti-plus" aria-hidden="true"></i> Agregar comisión
              </button>
            )}
          </div>
        )}

        {/* TAB: Docentes y permisos */}
        {tab === 'teachers' && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Docentes con acceso a este curso. <strong>full</strong> permite eliminar encuentros, <strong>edit</strong> permite editar, <strong>read</strong> es solo lectura.
            </p>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '16px' }}>
              <thead>
                <tr style={{ background: 'var(--hover-bg)' }}>
                  {['Docente','Comisión','Permiso',''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '7px 10px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {permissions.map(p => {
                  const u = p.profiles as { full_name: string; global_role: string } | null
                  const com = p.commission_id ? commissions.find(c => c.id === p.commission_id) : null
                  const permCls: Record<string, string> = { full: 'badge-accent', edit: 'badge-info', read: 'badge-neutral' }
                  const pc = permCls[p.permission] || permCls.read
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '9px 10px', fontWeight: 500 }}>{u?.full_name || '—'}</td>
                      <td style={{ padding: '9px 10px', color: 'var(--text-muted)' }}>
                        {com ? com.name : <span style={{ color: 'var(--text-muted)' }}>Todas</span>}
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        {isAdmin ? (
                          <select value={p.permission} onChange={e => changePermission(p.id, e.target.value)}
                            style={{ padding: '3px 7px', border: '1px solid var(--input-border)', borderRadius: '6px', fontSize: '12px', fontFamily: 'inherit' }}>
                            <option value="full">full</option>
                            <option value="edit">edit</option>
                            <option value="read">read</option>
                          </select>
                        ) : (
                          <span className={`badge ${pc}`}>
                            {p.permission}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        {isAdmin && (
                          <button onClick={() => removePermission(p.id)} style={{ background: 'none', border: '1px solid var(--badge-danger-bd)', borderRadius: '6px', padding: '3px 7px', cursor: 'pointer', color: 'var(--danger)', fontSize: '12px' }}>
                            <i className="ti ti-trash" aria-hidden="true"></i>
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Formulario inline para agregar docente */}
            {isAdmin && !addingTeacher && (
              <button onClick={() => setAddingTeacher(true)} style={{
                background: 'none', border: '1px dashed var(--input-border)', borderRadius: '8px',
                padding: '8px 16px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '13px',
                display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'inherit',
              }}>
                <i className="ti ti-user-plus" aria-hidden="true"></i> Agregar docente
              </button>
            )}

            {isAdmin && addingTeacher && (
              <div style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px', marginTop: '8px' }}>
                <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px' }}>Agregar docente al curso</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                  <div>
                    <label style={labelStyle}>Usuario</label>
                    <select value={newTeacherUserId} onChange={e => setNewTeacherUserId(e.target.value)}
                      style={inputStyle}>
                      <option value="">— Seleccionar —</option>
                      {availableProfiles.map(p => (
                        <option key={p.id} value={p.id}>{p.full_name}</option>
                      ))}
                    </select>
                    {availableProfiles.length === 0 && (
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Todos los usuarios ya tienen permisos.
                      </p>
                    )}
                  </div>
                  <div>
                    <label style={labelStyle}>Comisión</label>
                    <select value={newTeacherCommId} onChange={e => setNewTeacherCommId(e.target.value)} style={inputStyle}>
                      <option value="">Todas las comisiones</option>
                      {commissions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Permiso</label>
                    <select value={newTeacherPerm} onChange={e => setNewTeacherPerm(e.target.value)} style={inputStyle}>
                      <option value="full">full</option>
                      <option value="edit">edit</option>
                      <option value="read">read</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={handleAddTeacher} style={{
                    padding: '7px 16px', background: 'var(--accent)', color: 'white',
                    border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    Agregar
                  </button>
                  <button onClick={() => { setAddingTeacher(false); setNewTeacherUserId(''); setNewTeacherCommId(''); setNewTeacherPerm('edit') }}
                    style={{ padding: '7px 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-muted)' }}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
