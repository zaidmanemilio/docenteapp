'use client'
// src/app/(app)/courses/new/page.tsx
// Fix: después de crear, redirige a /import en vez de /dashboard

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type CommissionMode = 'single' | 'multi'

export default function NewCoursePage() {
  const router = useRouter()
  const supabase = createClient()

  const [saving,          setSaving]          = useState(false)
  const [commissionMode,  setCommissionMode]  = useState<CommissionMode>('single')
  const [multiCommissions,setMultiCommissions]= useState(['Comisión 1', 'Comisión 2'])

  const [form, setForm] = useState({
    name:              '',
    full_name:         '',
    career:            '',
    faculty:           '',
    year:              new Date().getFullYear(),
    description:       '',
    modality:          'presencial',
    level:             'grado',
    expected_sessions: 16,
    status:            'draft',
  })

  function updateField(key: string, value: string | number) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleCreate() {
    if (!form.name.trim()) { alert('El nombre del curso es obligatorio.'); return }
    setSaving(true)

    const { data: courseData, error: courseErr } = await supabase
      .from('courses')
      .insert({
        name:              form.name.trim(),
        full_name:         form.full_name.trim(),
        career:            form.career.trim(),
        faculty:           form.faculty.trim(),
        year:              form.year,
        description:       form.description.trim(),
        modality:          form.modality,
        level:             form.level, 
        expected_sessions: form.expected_sessions,
        status:            form.status,
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
        user_id: user.id, course_id: courseId, commission_id: null, permission: 'full',
      })
    }

    setSaving(false)
    // Redirigir a Importar cronograma en vez de Dashboard
    router.push(`/courses/${courseId}/import`)
    router.refresh()
  }

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '11px', fontWeight: 600,
    color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px',
  }
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', border: '1px solid var(--input-border)',
    borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', color: 'var(--text-primary)',
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.8.0/tabler-icons.min.css" />

      <div style={{ maxWidth: '620px' }}>
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>Nuevo curso</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Una vez creado, vas a poder importar el cronograma desde un archivo CSV o Excel.
          </p>
        </div>

        {/* Datos del curso */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', marginBottom: '16px' }}>
          <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '16px' }}>Identificación</p>

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Nombre corto del curso *</label>
            <input value={form.name} onChange={e => updateField('name', e.target.value)} placeholder="Ej: TISI 2027" style={inputStyle} />
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Nombre que aparece en el menú lateral.</p>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Nombre completo de la materia</label>
            <input value={form.full_name} onChange={e => updateField('full_name', e.target.value)} placeholder="Ej: Tecnología Informática y Sistemas de Información" style={inputStyle} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={labelStyle}>Carrera</label>
              <input value={form.career} onChange={e => updateField('career', e.target.value)} placeholder="Ej: Licenciatura en Administración" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Año</label>
              <input type="number" value={form.year} onChange={e => updateField('year', parseInt(e.target.value))} style={inputStyle} />
            </div>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Facultad / Universidad</label>
            <input value={form.faculty} onChange={e => updateField('faculty', e.target.value)} placeholder="Ej: FCE - UNLP" style={inputStyle} />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Descripción</label>
            <textarea value={form.description} onChange={e => updateField('description', e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical', minHeight: '72px' }} />
          </div>
        </div>

        {/* Configuración */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', marginBottom: '16px' }}>
          <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '16px' }}>Configuración</p>
<div style={{ marginBottom: '14px' }}>
  <label style={labelStyle}>Nivel académico</label>
  <select value={form.level} onChange={e => updateField('level', e.target.value)} style={inputStyle}>
    <option value="grado">Grado</option>
    <option value="posgrado">Posgrado</option>
  </select>
</div>
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
              <input type="number" value={form.expected_sessions} onChange={e => updateField('expected_sessions', parseInt(e.target.value))} style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Estado inicial</label>
            <select value={form.status} onChange={e => updateField('status', e.target.value)} style={inputStyle}>
              <option value="draft">Borrador</option>
              <option value="active">Activo</option>
            </select>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Un curso en Borrador aparece en el menú pero indica que está en preparación.</p>
          </div>
        </div>

        {/* Comisiones */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
          <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '16px' }}>Comisiones</p>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            {(['single', 'multi'] as CommissionMode[]).map(mode => (
              <button key={mode} onClick={() => setCommissionMode(mode)} style={{
                padding: '7px 16px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
                border: '1px solid',
                borderColor: commissionMode === mode ? 'var(--accent)' : 'var(--border)',
                background: commissionMode === mode ? 'var(--chip-accent-bg)' : 'var(--surface)',
                color: commissionMode === mode ? 'var(--chip-accent-fg)' : 'var(--text-muted)',
                fontFamily: 'inherit', fontWeight: commissionMode === mode ? 600 : 400,
              }}>
                {mode === 'single' ? 'Comisión única' : 'Múltiples comisiones'}
              </button>
            ))}
          </div>

          {commissionMode === 'single' ? (
            <div style={{ padding: '10px 14px', background: 'var(--hover-bg)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
              Se creará automáticamente una comisión llamada <strong>&quot;Única&quot;</strong>.
            </div>
          ) : (
            <div>
              {multiCommissions.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input value={c} onChange={e => setMultiCommissions(prev => prev.map((v, j) => j === i ? e.target.value : v))}
                    placeholder={`Comisión ${i + 1}`}
                    style={{ ...inputStyle, flex: 1, marginBottom: 0 }} />
                  {multiCommissions.length > 1 && (
                    <button onClick={() => setMultiCommissions(prev => prev.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: '1px solid var(--badge-danger-bd)', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', color: 'var(--danger)', fontSize: '13px' }}>
                      <i className="ti ti-trash" aria-hidden="true"></i>
                    </button>
                  )}
                </div>
              ))}
              <button onClick={() => setMultiCommissions(prev => [...prev, `Comisión ${prev.length + 1}`])}
                style={{ background: 'none', border: '1px dashed var(--input-border)', borderRadius: '8px', padding: '7px 14px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '13px', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                <i className="ti ti-plus" aria-hidden="true"></i> Agregar comisión
              </button>
            </div>
          )}
        </div>

        {/* Aviso sobre el siguiente paso */}
        <div style={{ padding: '14px 16px', background: 'var(--chip-accent-bg)', border: '1px solid var(--chip-accent-bd)', borderRadius: '10px', marginBottom: '20px', fontSize: '13px', color: 'var(--chip-accent-fg)', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <i className="ti ti-info-circle" style={{ fontSize: '18px', flexShrink: 0, marginTop: '1px' }} aria-hidden="true"></i>
          <span>Al crear el curso, vas a ser redirigido a <strong>Importar cronograma</strong> para cargar tus clases desde un archivo CSV o Excel.</span>
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={() => router.back()} style={{
            padding: '9px 18px', background: 'transparent', border: '1px solid var(--input-border)',
            borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-muted)',
          }}>
            Cancelar
          </button>
          <button onClick={handleCreate} disabled={saving} style={{
            padding: '9px 20px', background: 'var(--accent)', color: 'white',
            border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
            cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1, fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <i className="ti ti-plus" aria-hidden="true"></i>
            {saving ? 'Creando...' : 'Crear curso e ir a importar'}
          </button>
        </div>
      </div>
    </div>
  )
}
