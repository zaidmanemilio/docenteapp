'use client'
// src/app/(app)/archived/page.tsx

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useDialog } from '@/components/ui/Dialog'

interface Course {
  id: string; name: string; year: number; status: string
  description?: string; career?: string; faculty?: string
}

export default function ArchivedPage() {
  const router = useRouter()
  const supabase = createClient()
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [duplicating, setDuplicating] = useState<string | null>(null)

  const dialog = useDialog()

  // Reutilizar un curso pedía tres diálogos del navegador seguidos (nombre,
  // año, y un confirm por el cronograma). Son tres decisiones del MISMO acto:
  // van en un solo formulario, donde además se ven juntas antes de aceptar.
  const [dupForm, setDupForm] = useState<null | {
    course: Course; name: string; year: string; copySessions: boolean
  }>(null)

  function openDuplicate(course: Course) {
    setDupForm({
      course,
      name: `${course.name.replace(/\d{4}/, '').trim()} ${new Date().getFullYear() + 1}`.trim(),
      year: String(new Date().getFullYear() + 1),
      copySessions: true,
    })
  }

  async function load() {
    const { data } = await supabase
      .from('courses').select('*')
      .eq('status', 'archived').order('year', { ascending: false })
    setCourses(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function restore(courseId: string) {
    await supabase.from('courses').update({ status: 'active' }).eq('id', courseId)
    load()
    router.refresh()
  }

  async function duplicate() {
    if (!dupForm) return
    const { course, copySessions } = dupForm
    const newName = dupForm.name.trim()
    const newYear = parseInt(dupForm.year, 10)
    if (!newName) {
      await dialog.alert({ title: 'Falta el nombre', message: 'El curso nuevo necesita un nombre.' })
      return
    }
    if (!newYear || newYear < 2000 || newYear > 2100) {
      await dialog.alert({ title: 'Año inválido', message: 'Ingresá un año entre 2000 y 2100.' })
      return
    }
    setDupForm(null)
    setDuplicating(course.id)

    // Crear nuevo curso
    const { data: newCourse, error } = await supabase
      .from('courses')
      .insert({
        name: newName.trim(),
        year: newYear,
        description: course.description || '',
        career: course.career || '',
        faculty: course.faculty || '',
        status: 'draft',
        expected_sessions: 0,
      })
      .select().single()

    if (error || !newCourse) {
      setDuplicating(null)
      await dialog.alert({ title: 'No se pudo duplicar', message: error?.message || 'Error desconocido.', tone: 'danger' })
      return
    }

    // Copiar comisiones
    const { data: comms } = await supabase
      .from('commissions').select('*').eq('course_id', course.id)
    const commMap: Record<string, string> = {}
    if (comms && comms.length > 0) {
      for (const c of comms) {
        const { data: newComm } = await supabase
          .from('commissions')
          .insert({ course_id: newCourse.id, name: c.name, description: c.description || '' })
          .select().single()
        if (newComm) commMap[c.id] = newComm.id
      }
    }

    // Copiar permisos de usuarios
    const { data: perms } = await supabase
      .from('user_course_permissions').select('*').eq('course_id', course.id)
    if (perms && perms.length > 0) {
      await supabase.from('user_course_permissions').insert(
        perms.map(p => ({
          user_id: p.user_id,
          course_id: newCourse.id,
          commission_id: p.commission_id ? commMap[p.commission_id] || null : null,
          permission: p.permission,
        }))
      )
    }

    // Copiar cronograma si eligió
    if (copySessions) {
      const { data: sessions } = await supabase
        .from('sessions').select('*').eq('course_id', course.id).order('date')
      if (sessions && sessions.length > 0) {
        await supabase.from('sessions').insert(
          sessions.map(s => ({
            course_id: newCourse.id,
            class_number: s.class_number,
            date: s.date,
            title: s.title,
            type: s.type,
            responsible: s.responsible,
            modality: s.modality,
            status: 'pendiente',
            commission_scope: s.commission_scope in commMap ? commMap[s.commission_scope] : s.commission_scope,
            canva_url: '',
            partial_file_url: '',
            additional_links: [],
            guest_bio_url: '',
            workshop_brief_url: '',
            shared_notes: '',
            private_notes: '',
            start_time: s.start_time || '',
            end_time: s.end_time || '',
            location: s.location || '',
          }))
        )
        await supabase.from('courses').update({ expected_sessions: sessions.length }).eq('id', newCourse.id)
      }
    }

    setDuplicating(null)
    router.push(`/courses/dashboard?c=${newCourse.id}`)
    router.refresh()
  }

  if (loading) return <div style={{ padding: '24px', color: 'var(--text-muted)' }}>Cargando...</div>

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>

      <div className="page-head">
        <h1 className="page-title">Cursos archivados</h1>
        <p className="page-meta">
          <strong>{courses.length}</strong>{' '}
          {courses.length === 1 ? 'curso archivado' : 'cursos archivados'} · no aparecen
          en el menú lateral y se pueden restaurar o reutilizar para otro año
        </p>
      </div>

      {courses.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
          <i className="ti ti-archive" style={{ fontSize: '40px', opacity: 0.3, display: 'block', marginBottom: '12px' }} aria-hidden="true"></i>
          <p>No hay cursos archivados.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {courses.map(c => (
            <div key={c.id} style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px',
              padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 600, fontSize: '15px' }}>{c.name}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--hover-bg)', padding: '1px 7px', borderRadius: '99px' }}>
                    {c.year}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--hover-bg)', padding: '1px 7px', borderRadius: '99px' }}>
                    Archivado
                  </span>
                </div>
                {c.description && <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{c.description}</p>}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => restore(c.id)} style={{
                  padding: '7px 14px', background: 'var(--badge-success-bg)', color: 'var(--badge-success-fg)',
                  border: '1px solid #6ee7b7', borderRadius: '8px', fontSize: '12px',
                  cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '5px',
                }}>
                  <i className="ti ti-restore" aria-hidden="true"></i> Restaurar
                </button>
                <button onClick={() => openDuplicate(c)} disabled={duplicating === c.id} style={{
                  padding: '7px 14px', background: 'var(--chip-accent-bg)', color: 'var(--chip-accent-fg)',
                  border: '1px solid var(--chip-accent-bd)', borderRadius: '8px', fontSize: '12px',
                  cursor: duplicating === c.id ? 'wait' : 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: '5px', opacity: duplicating === c.id ? 0.6 : 1,
                }}>
                  <i className="ti ti-copy" aria-hidden="true"></i>
                  {duplicating === c.id ? 'Duplicando...' : 'Reutilizar para nuevo año'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {dupForm && (
        <div
          className="modal-overlay"
          onMouseDown={e => { if (e.target === e.currentTarget) setDupForm(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
        >
          <div className="modal-panel" role="dialog" aria-modal="true" aria-label="Reutilizar curso"
            style={{ background: 'var(--surface)', borderRadius: '12px', width: '460px', maxWidth: '100%', border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: 'var(--space-6) var(--space-6) var(--space-6)' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 600, letterSpacing: '-0.01em' }}>
                Reutilizar &quot;{dupForm.course.name}&quot;
              </h3>
              <p style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                Se crea un curso nuevo en borrador. El archivado no se modifica.
              </p>

              <div style={{ display: 'grid', gap: 'var(--space-4)', marginTop: 'var(--space-6)' }}>
                <div>
                  <label className="field-label" htmlFor="dup-name">Nombre del curso nuevo</label>
                  <input id="dup-name" className="field-input" value={dupForm.name}
                    onChange={e => setDupForm({ ...dupForm, name: e.target.value })} />
                </div>

                <div>
                  <label className="field-label" htmlFor="dup-year">Año</label>
                  <input id="dup-year" className="field-input" type="number" style={{ width: '120px' }}
                    value={dupForm.year} onChange={e => setDupForm({ ...dupForm, year: e.target.value })} />
                </div>

                <label style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                  <input type="checkbox" checked={dupForm.copySessions}
                    onChange={e => setDupForm({ ...dupForm, copySessions: e.target.checked })}
                    style={{ marginTop: '2px', flexShrink: 0 }} />
                  <span>
                    Copiar el cronograma de encuentros
                    <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      Las clases se copian como &quot;Pendiente&quot;, sin notas ni reviews.
                    </span>
                  </span>
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', padding: 'var(--space-4) var(--space-6)', borderTop: '1px solid var(--border)', background: 'var(--bg)', borderRadius: '0 0 12px 12px' }}>
              <button className="btn btn-ghost" onClick={() => setDupForm(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={duplicate}>Crear curso</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
