'use client'
// src/app/(app)/courses/[courseId]/todos/page.tsx

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Todo, Profile } from '@/types'
import { TODO_PRIORITY_LABELS } from '@/types'

const PRIO_STYLE: Record<string, { bg: string; color: string }> = {
  high:   { bg: '#fee2e2', color: '#dc2626' },
  medium: { bg: '#fef3c7', color: '#d97706' },
  low:    { bg: '#f3f4f6', color: '#6b7280' },
}

function fmtDate(d: string) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

interface SessionRef { id: string; class_number: number | null; title: string }

export default function TodosPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const supabase = createClient()

  const [todos, setTodos] = useState<Todo[]>([])
  const [sessions, setSessions] = useState<SessionRef[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [courseName, setCourseName] = useState('')
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('open')
  const [editTodo, setEditTodo] = useState<Partial<Todo> | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [profileRes, courseRes, todosRes, sessionsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('courses').select('name').eq('id', courseId).single(),
      supabase.from('todos').select('*').eq('course_id', courseId).order('created_at', { ascending: false }),
      supabase.from('sessions').select('id, class_number, title').eq('course_id', courseId).order('date'),
    ])
    setProfile(profileRes.data)
    setCourseName(courseRes.data?.name || '')
    setTodos(todosRes.data || [])
    setSessions(sessionsRes.data || [])
    setLoading(false)
  }, [courseId])

  useEffect(() => { load() }, [load])

  const canEdit = profile?.global_role === 'admin' || profile?.global_role === 'teacher'

  const filtered = todos.filter(t => {
    if (statusFilter === 'open') return t.status === 'open'
    if (statusFilter === 'closed') return t.status === 'closed'
    return true
  })

  const openCount = todos.filter(t => t.status === 'open').length

  async function toggleTodo(t: Todo) {
    const newStatus = t.status === 'open' ? 'closed' : 'open'
    await supabase.from('todos').update({ status: newStatus }).eq('id', t.id)
    load()
  }

  async function save() {
    if (!editTodo?.title) { alert('El título es obligatorio.'); return }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const payload = {
      course_id: courseId,
      title: editTodo.title,
      description: editTodo.description || '',
      priority: editTodo.priority || 'medium',
      due_date: editTodo.due_date || null,
      responsible: editTodo.responsible || '',
      session_id: editTodo.session_id || null,
      status: editTodo.status || 'open',
      created_by: user?.id,
    }
    if (isNew) {
      await supabase.from('todos').insert(payload)
    } else {
      await supabase.from('todos').update(payload).eq('id', editTodo.id)
    }
    setSaving(false)
    setEditTodo(null)
    load()
  }

  async function deleteTodo() {
    if (!editTodo?.id) return
    if (!confirm('¿Eliminar esta tarea?')) return
    await supabase.from('todos').delete().eq('id', editTodo.id)
    setEditTodo(null)
    load()
  }

  if (loading) return <div style={{ padding: '24px', color: '#6b7280' }}>Cargando...</div>

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.8.0/tabler-icons.min.css" />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div>
          <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '2px' }}>{courseName}</p>
          <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Tareas pendientes</h2>
        </div>
        {canEdit && (
          <button onClick={() => { setEditTodo({ priority: 'medium', status: 'open' }); setIsNew(true) }}
            style={{ padding: '8px 16px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <i className="ti ti-plus" aria-hidden="true"></i> Nueva tarea
          </button>
        )}
      </div>

      {/* Texto explicativo */}
      <div style={{ padding: '10px 14px', background: '#f8f9fb', border: '1px solid #e5e7eb', borderRadius: '8px', marginBottom: '20px', fontSize: '12px', color: '#6b7280', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <i className="ti ti-info-circle" style={{ fontSize: '15px', flexShrink: 0, marginTop: '1px' }} aria-hidden="true"></i>
        <span>
          Acá se listan <strong>tareas operativas del curso</strong> — cosas como "Cargar Canva de clase 4", "Definir invitado", "Subir archivo del parcial".
          Las <strong>clases pendientes</strong> de dar se gestionan desde <a href={`/courses/${courseId}/schedule`} style={{ color: '#6366f1' }}>Cronograma</a>, filtrando por estado Pendiente.
        </span>
      </div>

      {/* KPI rápido */}
      {openCount > 0 && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '8px', fontSize: '12px', color: '#92400e', marginBottom: '16px' }}>
          <i className="ti ti-clock-exclamation" aria-hidden="true"></i>
          <strong>{openCount}</strong> tarea{openCount !== 1 ? 's' : ''} abierta{openCount !== 1 ? 's' : ''}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {[['all','Todas'],['open','Abiertas'],['closed','Cerradas']].map(([v,l]) => (
          <button key={v} className={`filter-pill${statusFilter===v?' active':''}`} onClick={() => setStatusFilter(v)}>{l}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#6b7280' }}>
          <i className="ti ti-checks" style={{ fontSize: '40px', opacity: 0.4, display: 'block', marginBottom: '12px' }} aria-hidden="true"></i>
          <p>{statusFilter === 'open' ? '¡Sin tareas abiertas! Todo al día.' : 'Sin tareas en esta categoría.'}</p>
        </div>
      ) : (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '4px 20px' }}>
          {filtered.map(t => {
            const session = t.session_id ? sessions.find(s => s.id === t.session_id) : null
            return (
              <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
                <div onClick={() => canEdit && toggleTodo(t)} style={{
                  width: '20px', height: '20px', borderRadius: '4px',
                  border: t.status === 'closed' ? 'none' : '2px solid #d1d5db',
                  background: t.status === 'closed' ? '#059669' : 'transparent',
                  color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', cursor: canEdit ? 'pointer' : 'default', flexShrink: 0, marginTop: '2px',
                }}>
                  {t.status === 'closed' && <i className="ti ti-check" aria-hidden="true"></i>}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, textDecoration: t.status === 'closed' ? 'line-through' : 'none', color: t.status === 'closed' ? '#9ca3af' : '#111827' }}>
                    {t.title}
                  </div>
                  {t.description && <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '3px' }}>{t.description}</div>}
                  <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: 500, background: PRIO_STYLE[t.priority]?.bg, color: PRIO_STYLE[t.priority]?.color }}>
                      {TODO_PRIORITY_LABELS[t.priority]}
                    </span>
                    {t.responsible && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '99px', fontSize: '11px', background: '#f3f4f6', color: '#6b7280' }}>
                        <i className="ti ti-user" style={{ fontSize: '11px' }} aria-hidden="true"></i>{t.responsible}
                      </span>
                    )}
                    {t.due_date && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '99px', fontSize: '11px', background: '#f3f4f6', color: '#6b7280' }}>
                        <i className="ti ti-calendar" style={{ fontSize: '11px' }} aria-hidden="true"></i>{fmtDate(t.due_date)}
                      </span>
                    )}
                    {session && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '99px', fontSize: '11px', background: '#dbeafe', color: '#1d4ed8' }}>
                        <i className="ti ti-link" style={{ fontSize: '11px' }} aria-hidden="true"></i>
                        Clase {session.class_number}: {(session.title || '').slice(0, 28)}
                      </span>
                    )}
                  </div>
                </div>
                {canEdit && (
                  <button onClick={() => { setEditTodo({...t}); setIsNew(false) }}
                    style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: '#6b7280', fontSize: '13px', flexShrink: 0 }}>
                    <i className="ti ti-pencil" aria-hidden="true"></i>
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {editTodo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'white', borderRadius: '12px', width: '480px', maxWidth: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, flex: 1 }}>{isNew ? 'Nueva tarea' : 'Editar tarea'}</h3>
              <button onClick={() => setEditTodo(null)} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer' }}>
                <i className="ti ti-x" aria-hidden="true"></i>
              </button>
            </div>
            <div style={{ padding: '20px 22px' }}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px' }}>Título *</label>
                <input value={editTodo.title || ''} onChange={e => setEditTodo({...editTodo, title: e.target.value})} placeholder="Ej: Cargar Canva de clase 4" style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }} />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px' }}>Descripción</label>
                <textarea value={editTodo.description || ''} onChange={e => setEditTodo({...editTodo, description: e.target.value})} rows={2} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px' }}>Prioridad</label>
                  <select value={editTodo.priority || 'medium'} onChange={e => setEditTodo({...editTodo, priority: e.target.value as Todo['priority']})} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }}>
                    <option value="high">Alta</option>
                    <option value="medium">Media</option>
                    <option value="low">Baja</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px' }}>Fecha límite</label>
                  <input type="date" value={editTodo.due_date || ''} onChange={e => setEditTodo({...editTodo, due_date: e.target.value})} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px' }}>Responsable</label>
                  <input value={editTodo.responsible || ''} onChange={e => setEditTodo({...editTodo, responsible: e.target.value})} placeholder="Nombre del docente" style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px' }}>Encuentro asociado</label>
                  <select value={editTodo.session_id || ''} onChange={e => setEditTodo({...editTodo, session_id: e.target.value || null})} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }}>
                    <option value="">— Ninguno —</option>
                    {sessions.map(s => <option key={s.id} value={s.id}>Clase {s.class_number}: {(s.title || '').slice(0, 32)}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div style={{ padding: '14px 22px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {!isNew ? (
                <button onClick={deleteTodo} style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Eliminar
                </button>
              ) : <div></div>}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setEditTodo(null)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', color: '#6b7280' }}>Cancelar</button>
                <button onClick={save} disabled={saving} style={{ padding: '8px 16px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1, fontFamily: 'inherit' }}>
                  {saving ? 'Guardando...' : isNew ? 'Crear tarea' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
