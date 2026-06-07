'use client'
// src/app/(app)/courses/new/page.tsx

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type CommissionMode = 'single' | 'multi'

export default function NewCoursePage() {
  const router = useRouter()
  const supabase = createClient()

  const [saving, setSaving] = useState(false)
  const [commissionMode, setCommissionMode] = useState<CommissionMode>('single')
  const [multiCommissions, setMultiCommissions] = useState(['Comisión 1', 'Comisión 2'])

  const [form, setForm] = useState({
    name: '',
    full_name: '',
    career: '',
    faculty: '',
    year: new Date().getFullYear(),
    description: '',
    modality: 'presencial',
    expected_sessions: 16,
    status: 'draft',
  })

  function updateField(key: string, value: string | number) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function addCommission() {
    setMultiCommissions(prev => [...prev, `Comisión ${prev.length + 1}`])
  }

  function removeCommission(i: number) {
    setMultiCommissions(prev => prev.filter((_, j) => j !== i))
  }

  function updateCommission(i: number, val: string) {
    setMultiCommissions(prev => prev.map((c, j) => j === i ? val : c))
  }

  async function handleCreate() {
    if (!form.name.trim()) { alert('El nombre del curso es obligatorio.'); return }
    setSaving(true)

    // Crear curso
    const { data: courseData, error: courseErr } = await supabase
      .from('courses')
      .insert({
        name: form.name.trim(),
        full_name: form.full_name.trim(),
        career: form.career.trim(),
        faculty: form.faculty.trim(),
        year: form.year,
        description: form.description.trim(),
        modality: form.modality,
        expected_sessions: form.expected_sessions,
        status: form.status,
      })
      .select()
      .single()

    if (courseErr || !courseData) {
      alert('Error al crear el curso: ' + courseErr?.message)
      setSaving(false)
      return
    }

    const courseId = courseData.id

    // Crear comisiones
    const commissionsToCreate = commissionMode === 'single'
      ? [{ course_id: courseId, name: 'Única', description: '' }]
      : multiCommissions.filter(c => c.trim()).map(name => ({ course_id: courseId, name: name.trim(), description: '' }))

    await supabase.from('commissions').insert(commissionsToCreate)

    // Asignar permiso full al usuario actual
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('user_course_permissions').insert({
        user_id: user.id,
        course_id: courseId,
        commission_id: null,
        permission: 'full',
      })
    }

    setSaving(false)
    router.push(`/courses/${courseId}/dashboard`)
    router.refresh()
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.8.0/tabler-icons.min.css" />

      <div style={{ maxWidth: '620px' }}>
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#111827' }}>Nuevo curso</h2>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
            Completá los datos para crear un nuevo curso en la plataforma.
          </p>
        </div>

        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px', marginBottom: '16px' }}>
          <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280', marginBottom: '16px' }}>
            Identificación
          </p>

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Nombre corto del curso *</label>
            <input value={form.name} onChange={e => updateField('name', e.target.value)}
              placeholder="Ej: TISI 2027" style={inputStyle} />
            <p style={hintStyle}>Nombre que aparece en el menú lateral.</p>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Nombre completo de la materia</label>
            <input value={form.full_name} onChange={e => updateField('full_name', e.target.value)}
              placeholder="Ej: Tecnología de la Información y Sistemas Integrados" style={inputStyle} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={labelStyle}>Carrera</label>
              <input value={form.career} onChange={e => updateField('career', e.target.value)}
                placeholder="Ej: Ing. en Sistemas" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Año</label>
              <input type="number" value={form.year} onChange={e => updateField('year', parseInt(e.target.value))}
                style={inputStyle} />
            </div>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Facultad / Universidad</label>
            <input value={form.faculty} onChange={e => updateField('faculty', e.target.value)}
              placeholder="Ej: UNLP - Facultad de Informática" style={inputStyle} />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Descripción</label>
            <textarea value={form.description} onChange={e => updateField('description', e.target.value)}
              placeholder="Breve descripción del curso..." rows={3}
              style={{ ...inputStyle, resize: 'vertical', minHeight: '72px' }} />
          </div>
        </div>

        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px', marginBottom: '16px' }}>
          <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280', marginBottom: '16px' }}>
            Configuración
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={labelStyle}>Modalidad predominante</label>
              <select value={form.modality} onChange={e => updateField('modality', e.target.value)} style={inputStyle}>
                <option value="presencial">Presencial</option>
                <option value="virtual">Virtual</option>
                <option value="hibrida">Híbrida</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Encuentros esperados</label>
              <input type="number" value={form.expected_sessions}
                onChange={e => updateField('expected_sessions', parseInt(e.target.value))}
                style={inputStyle} />
            </div>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Estado inicial</label>
            <select value={form.status} onChange={e => updateField('status', e.target.value)} style={inputStyle}>
              <option value="draft">Borrador</option>
              <option value="active">Activo</option>
            </select>
            <p style={hintStyle}>Un curso en Borrador aparece en el menú pero indica que está en preparación.</p>
          </div>
        </div>

        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
          <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280', marginBottom: '16px' }}>
            Comisiones
          </p>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            {(['single', 'multi'] as CommissionMode[]).map(mode => (
              <button key={mode} onClick={() => setCommissionMode(mode)} style={{
                padding: '7px 16px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
                border: '1px solid',
                borderColor: commissionMode === mode ? '#6366f1' : '#e5e7eb',
                background: commissionMode === mode ? '#eef2ff' : 'white',
                color: commissionMode === mode ? '#4338ca' : '#6b7280',
                fontFamily: 'inherit', fontWeight: commissionMode === mode ? 600 : 400,
              }}>
                {mode === 'single' ? 'Comisión única' : 'Múltiples comisiones'}
              </button>
            ))}
          </div>

          {commissionMode === 'single' ? (
            <div style={{ padding: '10px 14px', background: '#f9fafb', borderRadius: '8px', fontSize: '13px', color: '#6b7280' }}>
              Se creará automáticamente una comisión llamada <strong>"Única"</strong>.
            </div>
          ) : (
            <div>
              {multiCommissions.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input value={c} onChange={e => updateCommission(i, e.target.value)}
                    placeholder={`Comisión ${i + 1}`}
                    style={{ ...inputStyle, flex: 1, marginBottom: 0 }} />
                  {multiCommissions.length > 1 && (
                    <button onClick={() => removeCommission(i)} style={{
                      background: 'none', border: '1px solid #fca5a5', borderRadius: '6px',
                      padding: '6px 10px', cursor: 'pointer', color: '#dc2626', fontSize: '13px',
                    }}>
                      <i className="ti ti-trash" aria-hidden="true"></i>
                    </button>
                  )}
                </div>
              ))}
              <button onClick={addCommission} style={{
                background: 'none', border: '1px dashed #d1d5db', borderRadius: '8px',
                padding: '7px 14px', cursor: 'pointer', color: '#6b7280',
                fontSize: '13px', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px',
              }}>
                <i className="ti ti-plus" aria-hidden="true"></i> Agregar comisión
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={() => router.back()} style={{
            padding: '9px 18px', background: 'transparent', border: '1px solid #e5e7eb',
            borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', color: '#6b7280',
          }}>
            Cancelar
          </button>
          <button onClick={handleCreate} disabled={saving} style={{
            padding: '9px 20px', background: '#6366f1', color: 'white',
            border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
            cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1, fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <i className="ti ti-plus" aria-hidden="true"></i>
            {saving ? 'Creando...' : 'Crear curso'}
          </button>
        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 600,
  color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px',
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb',
  borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit',
  color: '#111827', background: 'white', marginBottom: 0,
}
const hintStyle: React.CSSProperties = {
  fontSize: '11px', color: '#9ca3af', marginTop: '4px',
}
