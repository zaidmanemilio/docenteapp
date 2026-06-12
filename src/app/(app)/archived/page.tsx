'use client'
// src/app/(app)/archived/page.tsx

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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

  async function duplicate(course: Course) {
    const newName = prompt('Nombre del nuevo curso:', `${course.name.replace(/\d{4}/, '')} ${new Date().getFullYear() + 1}`.trim())
    if (!newName) return
    const newYear = parseInt(prompt('Año del nuevo curso:', String(new Date().getFullYear() + 1)) || '')
    if (!newYear) return
    const copySessions = confirm('¿Copiar el cronograma de encuentros?\n\nSi aceptás, se copian todas las clases con estado "Pendiente" y sin notas ni reviews.')

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
      alert('Error al duplicar: ' + error?.message)
      setDuplicating(null)
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
    alert(`Curso "${newName}" creado correctamente.`)
    router.push(`/courses/${newCourse.id}/dashboard`)
    router.refresh()
  }

  if (loading) return <div style={{ padding: '24px', color: 'var(--text-muted)' }}>Cargando...</div>

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.8.0/tabler-icons.min.css" />

      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Cursos archivados</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Los cursos archivados no aparecen en el menú principal. Podés restaurarlos o duplicarlos para un nuevo año.
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
                <button onClick={() => duplicate(c)} disabled={duplicating === c.id} style={{
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
    </div>
  )
}
