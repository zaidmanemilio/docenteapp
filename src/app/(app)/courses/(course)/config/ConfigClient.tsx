'use client'
// src/app/(app)/courses/[courseId]/config/page.tsx
// Fix: agregar docente usa select de usuarios reales, no prompt() con UUID

import { useState, useCallback } from 'react'
import RichTextArea from '@/components/ui/RichTextArea'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Course, Commission, Profile } from '@/types'
import { buildCourseBackup, downloadJson, downloadCsv, sessionsToCsv, todosToCsv } from '@/lib/backup/course-backup'
import { validateBackup, restoreCourseFromBackup } from '@/lib/backup/course-restore'
import { useDialog } from '@/components/ui/Dialog'
import { PERM_ORDER, PERM_LABEL, PERM_HINT } from '@/lib/permissions'
import { PermBadge } from '@/components/ui/Badges'
import { unaFila } from '@/lib/supabase/relation'

type ConfigTab = 'general' | 'links' | 'commissions' | 'teachers' | 'backup'

interface Permission {
  id: string
  user_id: string
  commission_id: string | null
  permission: string
  profiles: { full_name: string; global_role: string } | null
}

/** Lo que trae el padrón de perfiles: tres columnas, no un Profile entero. */
type PerfilBreve = Pick<Profile, 'id' | 'full_name' | 'global_role'>

/** Los cuatro links del curso que se editan con el mismo campo. */
const CAMPOS_LINK = ['zoom_url', 'program_url', 'moodle_url', 'materials_url'] as const
type CampoLink = typeof CAMPOS_LINK[number]

type CourseDetail = Course & {
  full_name?: string; career?: string; faculty?: string
  schedule_text?: string; zoom_url?: string; program_url?: string
  moodle_url?: string; materials_url?: string; modality?: string; internal_notes?: string
  timezone?: string
}

interface ConfigClientProps {
  courseId: string
  profile: Profile
  initialCourse: CourseDetail | null
  initialCommissions: Commission[]
  initialPermissions: Permission[]
  initialAllProfiles: PerfilBreve[]
}

export default function ConfigClient({
  courseId, profile, initialCourse, initialCommissions,
  initialPermissions, initialAllProfiles,
}: ConfigClientProps) {
  const router = useRouter()
  const supabase = createClient()

  const [course, setCourse] = useState<CourseDetail | null>(initialCourse)
  const [commissions,  setCommissions]  = useState<Commission[]>(initialCommissions)
  const [permissions,  setPermissions]  = useState<Permission[]>(initialPermissions)
  const [allProfiles,  setAllProfiles]  = useState<PerfilBreve[]>(initialAllProfiles)
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [tab,          setTab]          = useState<ConfigTab>('general')
  // Respaldo / restauración
  const [backupBusy,   setBackupBusy]   = useState(false)
  const [backupMsg,    setBackupMsg]    = useState('')
  const [restoreBusy,  setRestoreBusy]  = useState(false)
  const [restoreMsg,   setRestoreMsg]   = useState('')
  const [restoreErr,   setRestoreErr]   = useState('')

  // Estado para el formulario de agregar docente
  const [addingTeacher,    setAddingTeacher]    = useState(false)
  const [newTeacherUserId, setNewTeacherUserId] = useState('')
  const [newTeacherCommId, setNewTeacherCommId] = useState('')  // '' = todas
  const [newTeacherPerm,   setNewTeacherPerm]   = useState('edit')

  // Se sigue usando para refrescar después de guardar / asignar permisos.
  const load = useCallback(async () => {
    const [courseRes, commsRes, permsRes, allProfilesRes] = await Promise.all([
      supabase.from('courses').select('*').eq('id', courseId).single(),
      supabase.from('commissions').select('*').eq('course_id', courseId),
      supabase.from('user_course_permissions')
        .select('id, user_id, commission_id, permission, profiles(full_name, global_role)')
        .eq('course_id', courseId),
      supabase.from('profiles').select('id, full_name, global_role').order('full_name'),
    ])
    setCourse(courseRes.data)
    setCommissions(commsRes.data || [])
    // profiles(...) es una relación a-uno: viene un objeto, no un arreglo.
    setPermissions((permsRes.data || []).map(p => ({ ...p, profiles: unaFila(p.profiles) })))
    setAllProfiles(allProfilesRes.data || [])
  }, [courseId, supabase])


  const isAdmin = profile.global_role === 'admin'
  const dialog = useDialog()

  // --- Archivar curso ---
  // Había DOS archiveCourse() declaradas en este archivo. La segunda tapaba a
  // la primera, así que el estado `archiving` nunca se encendía y el botón de
  // abajo no mostraba "Archivando…" ni se deshabilitaba. Queda una sola.
  const [archiving, setArchiving] = useState(false)
  async function archiveCourse() {
    if (!course) return
    const ok = await dialog.confirm({
      title: 'Archivar el curso',
      message: 'Deja de aparecer en el menú lateral. No se borra nada: podés restaurarlo o reutilizarlo desde "Cursos archivados".',
      confirmLabel: 'Archivar',
    })
    if (!ok) return
    setArchiving(true)
    const { error } = await supabase.from('courses').update({ status: 'archived' }).eq('id', courseId)
    setArchiving(false)
    if (error) {
      await dialog.alert({ title: 'No se pudo archivar', message: error.message, tone: 'danger' })
      return
    }
    router.push('/')
    router.refresh()
  }

  // --- Respaldo / exportación ---
  async function exportBackupJson() {
    setBackupBusy(true); setBackupMsg('')
    try {
      const backup = await buildCourseBackup(supabase, courseId)
      const safeName = (course?.name || 'curso').replace(/[^a-z0-9]+/gi, '_').toLowerCase()
      const date = new Date().toISOString().slice(0, 10)
      downloadJson(backup, `respaldo_${safeName}_${date}.json`)
      setBackupMsg('Respaldo JSON descargado.')
    } catch (e) {
      setBackupMsg(`Error: ${e instanceof Error ? e.message : 'no se pudo generar el respaldo'}`)
    }
    setBackupBusy(false)
  }

  async function exportCsv(kind: 'sessions' | 'todos') {
    setBackupBusy(true); setBackupMsg('')
    try {
      const backup = await buildCourseBackup(supabase, courseId)
      const safeName = (course?.name || 'curso').replace(/[^a-z0-9]+/gi, '_').toLowerCase()
      const date = new Date().toISOString().slice(0, 10)
      if (kind === 'sessions') {
        downloadCsv(sessionsToCsv(backup.sessions), `cronograma_${safeName}_${date}.csv`)
      } else {
        downloadCsv(todosToCsv(backup.todos), `tareas_${safeName}_${date}.csv`)
      }
      setBackupMsg('CSV descargado.')
    } catch (e) {
      setBackupMsg(`Error: ${e instanceof Error ? e.message : 'no se pudo generar el CSV'}`)
    }
    setBackupBusy(false)
  }

  // --- Restauración desde JSON ---
  async function handleRestoreFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // permitir re-seleccionar el mismo archivo
    if (!file) return
    setRestoreErr(''); setRestoreMsg('')

    let parsed: unknown
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      setRestoreErr('El archivo no es un JSON válido.')
      return
    }
    const check = validateBackup(parsed)
    if (!check.ok || !check.backup) { setRestoreErr(check.error || 'Respaldo inválido.'); return }

    const origName = (check.backup.course.name as string) || 'curso'
    const okRestore = await dialog.confirm({
      title: 'Restaurar como curso nuevo',
      message: `Se crea un curso NUEVO a partir del respaldo de "${origName}". Ningún curso existente se modifica.`,
      confirmLabel: 'Crear curso',
    })
    if (!okRestore) return

    setRestoreBusy(true)
    const result = await restoreCourseFromBackup(supabase, check.backup)
    setRestoreBusy(false)
    if (!result.ok) { setRestoreErr(result.error || 'No se pudo restaurar.'); return }
    setRestoreMsg(`Curso restaurado: ${result.counts?.commissions || 0} comisiones, ${result.counts?.sessions || 0} clases, ${result.counts?.todos || 0} tareas. Recargá la lista de cursos para verlo.`)
  }

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
      timezone:          course.timezone || 'America/Argentina/Buenos_Aires',
      level:             course.level || 'grado',
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

  async function addCommission() {
    const name = await dialog.prompt({
      title: 'Nueva comisión',
      label: 'Nombre',
      placeholder: 'Ej. Comisión A — martes',
      confirmLabel: 'Crear',
    })
    if (!name) return
    await supabase.from('commissions').insert({ course_id: courseId, name, description: '' })
    load()
  }

  async function editCommission(c: Commission) {
    const name = await dialog.prompt({
      title: 'Renombrar comisión',
      label: 'Nombre',
      defaultValue: c.name,
    })
    if (!name || name === c.name) return
    await supabase.from('commissions').update({ name }).eq('id', c.id)
    load()
  }

  async function deleteCommission(id: string) {
    const ok = await dialog.confirm({
      title: 'Eliminar esta comisión',
      message: 'Los encuentros asignados a ella quedan sin comisión.',
      confirmLabel: 'Eliminar',
      tone: 'danger',
    })
    if (!ok) return
    await supabase.from('commissions').delete().eq('id', id)
    load()
  }

  // Agregar docente — usa select de usuarios reales
  async function handleAddTeacher() {
    if (!newTeacherUserId) {
      await dialog.alert({ title: 'Falta el usuario', message: 'Elegí a quién le querés dar acceso al curso.' })
      return
    }
    const { error } = await supabase.from('user_course_permissions').upsert({
      user_id:       newTeacherUserId,
      course_id:     courseId,
      commission_id: newTeacherCommId || null,
      permission:    newTeacherPerm,
    }, { onConflict: 'user_id,course_id,commission_id' })

    if (error) {
      await dialog.alert({ title: 'No se pudo agregar', message: error.message, tone: 'danger' })
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
    const ok = await dialog.confirm({
      title: 'Quitar el acceso',
      message: 'La persona deja de ver este curso. Podés volver a darle acceso cuando quieras.',
      confirmLabel: 'Quitar acceso',
      tone: 'danger',
    })
    if (!ok) return
    await supabase.from('user_course_permissions').delete().eq('id', id)
    load()
  }

  if (!course) return <div style={{ padding: '24px', color: 'var(--text-muted)' }}>Curso no encontrado.</div>

  // Usuarios que ya tienen permiso en este curso (para no repetirlos en el select)
  const usersWithPerm = new Set(permissions.map(p => p.user_id))
  const availableProfiles = allProfiles.filter(p => !usersWithPerm.has(p.id))

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div className="page-head" style={{ marginBottom: 0 }}>
          <h1 className="page-title">Configuración</h1>
          <p className="page-meta">
            {course.name} · {course.year}
            {' · '}<strong>{commissions.length}</strong>{' '}
            {commissions.length === 1 ? 'comisión' : 'comisiones'}
            {' · '}<strong>{permissions.length}</strong>{' '}
            {permissions.length === 1 ? 'persona con acceso' : 'personas con acceso'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {isAdmin && (
            <button className="btn btn-ghost" onClick={archiveCourse} disabled={archiving}>
              <i className="ti ti-archive" aria-hidden="true"></i>
              {archiving ? 'Archivando…' : 'Archivar'}
            </button>
          )}
          {isAdmin && (
            <button className="btn btn-primary" onClick={saveCourse} disabled={saving}
              style={{ cursor: saving ? 'wait' : 'pointer' }}>
              {saved
                ? <><i className="ti ti-check" aria-hidden="true"></i> Guardado</>
                : <><i className="ti ti-device-floppy" aria-hidden="true"></i> Guardar</>}
            </button>
          )}
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Secciones de la configuración">
        {([
          ['general',     'General'],
          ['links',       'Links del curso'],
          ['commissions', 'Comisiones'],
          ['teachers',    'Accesos'],
          ...(isAdmin ? [['backup', 'Respaldo'] as const] : []),
        ] as readonly (readonly [ConfigTab, string])[]).map(([k, label]) => (
          <button key={k} className="tab" role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: '620px' }}>

        {/* TAB: General */}
        {tab === 'general' && (
          <div className="card">
            <div style={{ marginBottom: '14px' }}>
              <label className="field-label">Nombre corto del curso</label>
              <input value={course.name} onChange={e => setCourse({...course, name: e.target.value})} disabled={!isAdmin} className="field-input" />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label className="field-label">Nombre completo de la materia</label>
              <input value={course.full_name || ''} onChange={e => setCourse({...course, full_name: e.target.value})} disabled={!isAdmin} placeholder="Nombre oficial de la materia" className="field-input" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label className="field-label">Carrera</label>
                <input value={course.career || ''} onChange={e => setCourse({...course, career: e.target.value})} disabled={!isAdmin} placeholder="Ej: Ing. en Sistemas" className="field-input" />
              </div>
              <div>
                <label className="field-label">Año</label>
                <input type="number" value={course.year} onChange={e => setCourse({...course, year: parseInt(e.target.value)})} disabled={!isAdmin} className="field-input" />
              </div>
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label className="field-label">Facultad / Universidad</label>
              <input value={course.faculty || ''} onChange={e => setCourse({...course, faculty: e.target.value})} disabled={!isAdmin} placeholder="Ej: UNLP - Informática" className="field-input" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div style={{ marginBottom: '14px' }}>
  <label className="field-label">Nivel académico</label>
  <select
    value={course.level || 'grado'}
    onChange={e => setCourse({...course, level: e.target.value})}
    disabled={!isAdmin}
    className="field-input"
  >
    <option value="grado">Grado</option>
    <option value="posgrado">Posgrado</option>
  </select>
</div>
              <div>
                <label className="field-label">Modalidad predominante</label>
                <select value={course.modality || 'presencial'} onChange={e => setCourse({...course, modality: e.target.value})} disabled={!isAdmin} className="field-input">
                  <option value="presencial">Presencial</option>
                  <option value="virtual">Virtual</option>
                  <option value="hibrida">Híbrida</option>
                </select>
              </div>
              <div>
                <label className="field-label">Zona horaria de las clases</label>
                <select value={course.timezone || 'America/Argentina/Buenos_Aires'} onChange={e => setCourse({...course, timezone: e.target.value})} disabled={!isAdmin} className="field-input">
                  <option value="America/Argentina/Buenos_Aires">Argentina (Buenos Aires)</option>
                  <option value="Europe/Madrid">España (Madrid)</option>
                  <option value="America/Montevideo">Uruguay (Montevideo)</option>
                  <option value="America/Santiago">Chile (Santiago)</option>
                  <option value="America/Sao_Paulo">Brasil (São Paulo)</option>
                  <option value="America/Bogota">Colombia (Bogotá)</option>
                  <option value="America/Mexico_City">México (Ciudad de México)</option>
                </select>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  En qué huso se dictan las clases. Se usa al exportar el cronograma
                  al calendario, para que se vea en la hora local de cada persona.
                </p>
              </div>
              <div>
                <label className="field-label">Encuentros esperados</label>
                <input type="number" value={course.expected_sessions} onChange={e => setCourse({...course, expected_sessions: parseInt(e.target.value)})} disabled={!isAdmin} className="field-input" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label className="field-label">Estado</label>
                <select value={course.status} onChange={e => setCourse({...course, status: e.target.value as Course['status']})} disabled={!isAdmin} className="field-input">
                  <option value="draft">Borrador</option>
                  <option value="active">Activo</option>
                  <option value="closed">Cerrado</option>
                </select>
              </div>
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label className="field-label">Días y horarios</label>
              <input value={course.schedule_text || ''} onChange={e => setCourse({...course, schedule_text: e.target.value})} disabled={!isAdmin} placeholder="Ej: Martes 18-21hs y Jueves 18-21hs" className="field-input" />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label className="field-label">Descripción</label>
              <RichTextArea value={course.description || ''} onChange={v => setCourse({...course, description: v})} disabled={!isAdmin} rows={4} className="field-input" style={{ resize: 'vertical', minHeight: '90px' }} />
            </div>
            <div>
              <label className="field-label">Observaciones internas</label>
              <RichTextArea value={course.internal_notes || ''} onChange={v => setCourse({...course, internal_notes: v})} disabled={!isAdmin} rows={4} placeholder="Notas visibles solo para el equipo docente..." className="field-input" style={{ resize: 'vertical', minHeight: '90px' }} />
            </div>

            {isAdmin && (
              <div style={{ marginTop: '8px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                <label className="field-label">Archivar curso</label>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                  Al archivar, el curso deja de aparecer en el menú lateral. Podrás restaurarlo o reutilizarlo cuando quieras desde &quot;Cursos archivados&quot;. No se borra nada.
                </p>
                <button onClick={archiveCourse} disabled={archiving}
                  style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--badge-warning-bd)', color: 'var(--warning)', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: archiving ? 'wait' : 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '6px', opacity: archiving ? 0.6 : 1 }}>
                  <i className="ti ti-archive" aria-hidden="true"></i>
                  {archiving ? 'Archivando...' : 'Archivar curso'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB: Links */}
        {tab === 'links' && (
          <div className="card">
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
              Links generales del curso. El link de Zoom aparece en el cronograma para encuentros virtuales sin link específico.
            </p>
            {([
              { key: 'zoom_url',      label: 'Link general de Zoom',   icono: 'ti-video',      placeholder: 'https://zoom.us/j/...' },
              { key: 'program_url',   label: 'Programa de la materia', icono: 'ti-file-text',  placeholder: 'https://drive.google.com/...' },
              { key: 'moodle_url',    label: 'Aula virtual / Moodle',  icono: 'ti-school',     placeholder: 'https://campus.edu.ar/...' },
              { key: 'materials_url', label: 'Carpeta de materiales',  icono: 'ti-folder',     placeholder: 'https://drive.google.com/...' },
            ] as { key: CampoLink; label: string; icono: string; placeholder: string }[])
              .map(({ key, label, icono, placeholder }) => (
              <div key={key} style={{ marginBottom: '16px' }}>
                <label className="field-label">
                  <i className={`ti ${icono}`} aria-hidden="true"></i> {label}
                </label>
                <input
                  value={course[key] || ''}
                  onChange={e => setCourse({...course, [key]: e.target.value})}
                  disabled={!isAdmin} placeholder={placeholder} className="field-input"
                />
              </div>
            ))}
          </div>
        )}

        {/* TAB: Comisiones */}
        {tab === 'commissions' && (
          <div className="card">
            {commissions.map(c => (
              <div key={c.id} className="list-row">
                <i className="ti ti-users" style={{ color: 'var(--accent)', fontSize: '16px' }} aria-hidden="true"></i>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: '13px' }}>{c.name}</div>
                  {c.description && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{c.description}</div>}
                </div>
                {isAdmin && (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button className="row-danger" style={{ borderColor: 'var(--border)' }}
                      onClick={() => editCommission(c)} aria-label={`Renombrar ${c.name}`} title="Renombrar">
                      <i className="ti ti-pencil" aria-hidden="true"></i>
                    </button>
                    <button className="row-danger" onClick={() => deleteCommission(c.id)}
                      aria-label={`Eliminar ${c.name}`} title="Eliminar">
                      <i className="ti ti-trash" aria-hidden="true"></i>
                    </button>
                  </div>
                )}
              </div>
            ))}
            {isAdmin && (
              <button className="btn-dashed" onClick={addCommission} style={{ marginTop: 'var(--space-3)' }}>
                <i className="ti ti-plus" aria-hidden="true"></i> Agregar comisión
              </button>
            )}
          </div>
        )}

        {/* TAB: Docentes y permisos */}
        {tab === 'teachers' && (
          <div className="card">
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Quién tiene acceso a este curso y con qué alcance.
              {PERM_ORDER.map((k, i) => (
                <span key={k}>
                  {i === 0 ? ' ' : ' '}
                  <strong>{PERM_LABEL[k]}</strong>: {PERM_HINT[k].replace(/\.$/, '')}{i < PERM_ORDER.length - 1 ? ';' : '.'}
                </span>
              ))}
            </p>

            <div className="table-scroll">
              <table className="data-table" style={{ marginBottom: 'var(--space-4)' }}>
                <thead>
                  <tr>
                    {['Persona','Comisión','Permiso',''].map(h => (
                      <th key={h} scope="col">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {permissions.map(p => {
                    const u = p.profiles as { full_name: string; global_role: string } | null
                    const com = p.commission_id ? commissions.find(c => c.id === p.commission_id) : null
                    return (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 500 }}>{u?.full_name || '—'}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{com ? com.name : 'Todas'}</td>
                        <td>
                          {isAdmin ? (
                            <select value={p.permission} onChange={e => changePermission(p.id, e.target.value)}
                              aria-label="Permiso en el curso"
                              style={{ padding: '3px 7px', border: '1px solid var(--input-border)', borderRadius: '6px', fontSize: '12px', fontFamily: 'inherit' }}>
                              {PERM_ORDER.map(k => (
                                <option key={k} value={k}>{PERM_LABEL[k]}</option>
                              ))}
                            </select>
                          ) : (
                            <PermBadge permission={p.permission} />
                          )}
                        </td>
                        <td>
                          {isAdmin && (
                            <button className="row-danger" onClick={() => removePermission(p.id)}
                              aria-label={`Quitar el acceso de ${u?.full_name || 'esta persona'}`} title="Quitar acceso">
                              <i className="ti ti-trash" aria-hidden="true"></i>
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Formulario inline para agregar docente */}
            {isAdmin && !addingTeacher && (
              <button className="btn-dashed" onClick={() => setAddingTeacher(true)}>
                <i className="ti ti-user-plus" aria-hidden="true"></i> Dar acceso a alguien
              </button>
            )}

            {isAdmin && addingTeacher && (
              <div style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
                <p className="field-label" style={{ marginBottom: 'var(--space-3)' }}>Dar acceso al curso</p>
                <div className="field-grid">
                  <div>
                    <label className="field-label">Usuario</label>
                    <select value={newTeacherUserId} onChange={e => setNewTeacherUserId(e.target.value)}
                      className="field-input">
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
                    <label className="field-label">Comisión</label>
                    <select value={newTeacherCommId} onChange={e => setNewTeacherCommId(e.target.value)} className="field-input">
                      <option value="">Todas las comisiones</option>
                      {commissions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Permiso</label>
                    <select value={newTeacherPerm} onChange={e => setNewTeacherPerm(e.target.value)} className="field-input">
                      {PERM_ORDER.map(k => (
                        <option key={k} value={k}>{PERM_LABEL[k]}</option>
                      ))}
                    </select>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {PERM_HINT[newTeacherPerm]}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-primary" onClick={handleAddTeacher}>Dar acceso</button>
                  <button className="btn btn-ghost"
                    onClick={() => { setAddingTeacher(false); setNewTeacherUserId(''); setNewTeacherCommId(''); setNewTeacherPerm('edit') }}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'backup' && isAdmin && (
          <div style={{ maxWidth: '640px' }}>
            {/* Exportar */}
            <div className="card">
              <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>Exportar y respaldar</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                El respaldo JSON guarda el curso completo (clases, comisiones, tareas) y sirve para restaurarlo. Los CSV son para leer o compartir en Excel.
              </p>
              {backupMsg && <div className="alert" style={{ padding: '8px 12px', borderRadius: '8px', fontSize: '12px', marginBottom: '12px', color: 'var(--text-muted)' }}>{backupMsg}</div>}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button onClick={exportBackupJson} disabled={backupBusy}
                  style={{ padding: '8px 14px', background: 'var(--accent-solid)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: backupBusy ? 0.6 : 1 }}>
                  <i className="ti ti-download" style={{ marginRight: '6px' }} aria-hidden="true"></i>
                  Respaldo completo (JSON)
                </button>
                <button onClick={() => exportCsv('sessions')} disabled={backupBusy}
                  style={{ padding: '8px 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-primary)' }}>
                  Cronograma (CSV)
                </button>
                <button onClick={() => exportCsv('todos')} disabled={backupBusy}
                  style={{ padding: '8px 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-primary)' }}>
                  Tareas (CSV)
                </button>
              </div>
            </div>

            {/* Restaurar */}
            <div className="card">
              <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>Restaurar desde respaldo</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                Subí un archivo JSON de respaldo. Se creará un <strong>curso nuevo</strong> con su contenido — no se modifica ningún curso existente.
              </p>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Nota: los permisos de usuarios no se restauran automáticamente; reasignalos en la pestaña Docentes del curso restaurado.
              </p>
              {restoreErr && <div className="alert alert-danger" style={{ padding: '8px 12px', borderRadius: '8px', fontSize: '12px', marginBottom: '12px' }}>{restoreErr}</div>}
              {restoreMsg && <div className="alert alert-success" style={{ padding: '8px 12px', borderRadius: '8px', fontSize: '12px', marginBottom: '12px' }}>{restoreMsg}</div>}
              <label style={{ display: 'inline-block', padding: '8px 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', cursor: restoreBusy ? 'wait' : 'pointer', fontFamily: 'inherit', color: 'var(--text-primary)' }}>
                {restoreBusy ? 'Restaurando...' : 'Elegir archivo JSON'}
                <input type="file" accept=".json,application/json" onChange={handleRestoreFile} disabled={restoreBusy} style={{ display: 'none' }} />
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
