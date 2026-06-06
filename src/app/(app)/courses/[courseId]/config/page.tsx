'use client'
// src/app/(app)/courses/[courseId]/config/page.tsx

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Course, Commission, Profile } from '@/types'

export default function ConfigPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const supabase = createClient()

  const [course, setCourse] = useState<Course | null>(null)
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [profileRes, courseRes, commsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('courses').select('*, subjects(name)').eq('id', courseId).single(),
      supabase.from('commissions').select('*').eq('course_id', courseId),
    ])
    setProfile(profileRes.data)
    setCourse(courseRes.data)
    setCommissions(commsRes.data || [])
    setLoading(false)
  }, [courseId])

  useEffect(() => { load() }, [load])

  const isAdmin = profile?.global_role === 'admin'

  async function saveCourse() {
    if (!course) return
    setSaving(true)
    await supabase.from('courses').update({
      name: course.name,
      description: course.description,
      status: course.status,
      expected_sessions: course.expected_sessions,
      year: course.year,
    }).eq('id', courseId)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
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
    if (!confirm('¿Eliminar esta comisión? Los encuentros asociados quedarán sin comisión.')) return
    await supabase.from('commissions').delete().eq('id', id)
    load()
  }

  if (loading || !course) return <div style={{ padding: '24px', color: '#6b7280' }}>Cargando...</div>

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.8.0/tabler-icons.min.css" />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '2px' }}>{course.name}</p>
          <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Configuración del curso</h2>
        </div>
        {isAdmin && (
          <button onClick={saveCourse} disabled={saving} style={{ padding: '8px 16px', background: saving ? '#9ca3af' : '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: saving ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {saved ? <><i className="ti ti-check" aria-hidden="true"></i> Guardado</> : <><i className="ti ti-device-floppy" aria-hidden="true"></i> Guardar</>}
          </button>
        )}
      </div>

      <div style={{ maxWidth: '600px' }}>
        {/* Course data */}
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px 24px', marginBottom: '16px' }}>
          <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280', marginBottom: '16px', paddingBottom: '8px', borderBottom: '1px solid #e5e7eb' }}>Datos del curso</p>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px' }}>Nombre del curso</label>
            <input
              value={course.name}
              onChange={e => setCourse({...course, name: e.target.value})}
              disabled={!isAdmin}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', opacity: isAdmin ? 1 : 0.7 }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px' }}>Año</label>
              <input
                type="number"
                value={course.year}
                onChange={e => setCourse({...course, year: parseInt(e.target.value)})}
                disabled={!isAdmin}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', opacity: isAdmin ? 1 : 0.7 }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px' }}>Estado</label>
              <select
                value={course.status}
                onChange={e => setCourse({...course, status: e.target.value as Course['status']})}
                disabled={!isAdmin}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', opacity: isAdmin ? 1 : 0.7 }}
              >
                <option value="draft">Borrador</option>
                <option value="active">Activo</option>
                <option value="closed">Cerrado</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px' }}>Encuentros esperados</label>
            <input
              type="number"
              value={course.expected_sessions}
              onChange={e => setCourse({...course, expected_sessions: parseInt(e.target.value)})}
              disabled={!isAdmin}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', opacity: isAdmin ? 1 : 0.7 }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px' }}>Descripción</label>
            <textarea
              value={course.description || ''}
              onChange={e => setCourse({...course, description: e.target.value})}
              disabled={!isAdmin}
              rows={3}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', opacity: isAdmin ? 1 : 0.7 }}
            />
          </div>
        </div>

        {/* Commissions */}
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px 24px' }}>
          <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280', marginBottom: '16px', paddingBottom: '8px', borderBottom: '1px solid #e5e7eb' }}>Comisiones</p>

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
      </div>
    </div>
  )
}
