'use client'
// src/app/(app)/courses/[courseId]/presentation/page.tsx

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface CourseData {
  id: string
  name: string
  full_name?: string
  career?: string
  faculty?: string
  year: number
  description?: string
  status: string
  expected_sessions: number
  modality?: string
  schedule_text?: string
  zoom_url?: string
  program_url?: string
  moodle_url?: string
  materials_url?: string
  internal_notes?: string
}

interface Commission { id: string; name: string; description?: string }
interface Permission { user_id: string; commission_id: string | null; permission: string; profiles: { full_name: string } | null }

function LinkRow({ label, url, icon }: { label: string; url: string; icon: string }) {
  if (!url) return null
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '8px 12px', borderRadius: '8px',
      background: '#eef2ff', border: '1px solid #c7d2fe',
      color: '#4338ca', fontSize: '13px', textDecoration: 'none',
      marginBottom: '8px', transition: 'background 0.15s',
    }}>
      <i className={`ti ${icon}`} style={{ fontSize: '16px', flexShrink: 0 }} aria-hidden="true"></i>
      <span style={{ fontWeight: 500 }}>{label}</span>
      <i className="ti ti-external-link" style={{ fontSize: '12px', marginLeft: 'auto', opacity: 0.6 }} aria-hidden="true"></i>
    </a>
  )
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', gap: '12px', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
      <span style={{ fontSize: '12px', color: 'var(--text-muted)', width: '140px', flexShrink: 0, fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}

const MODALITY_LABELS: Record<string, string> = {
  presencial: 'Presencial',
  virtual: 'Virtual',
  hibrida: 'Híbrida',
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  draft: 'Borrador',
  closed: 'Cerrado',
  archived: 'Archivado',
}

export default function PresentationPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const supabase = createClient()

  const [course, setCourse] = useState<CourseData | null>(null)
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [courseRes, commsRes, permsRes] = await Promise.all([
      supabase.from('courses').select('*').eq('id', courseId).single(),
      supabase.from('commissions').select('*').eq('course_id', courseId),
      supabase.from('user_course_permissions')
        .select('user_id, commission_id, permission, profiles(full_name)')
        .eq('course_id', courseId),
    ])
    setCourse(courseRes.data)
    setCommissions(commsRes.data || [])
    setPermissions(permsRes.data || [])
    setLoading(false)
  }, [courseId])

  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ padding: '24px', color: 'var(--text-muted)' }}>Cargando...</div>
  if (!course) return <div style={{ padding: '24px', color: 'var(--text-muted)' }}>Curso no encontrado.</div>

  const hasAnyLink = course.zoom_url || course.program_url || course.moodle_url || course.materials_url

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.8.0/tabler-icons.min.css" />

      {/* Header */}
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span style={{
              padding: '2px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 600,
              background: course.status === 'active' ? '#d1fae5' : '#f3f4f6',
              color: course.status === 'active' ? 'var(--success)' : 'var(--text-muted)',
            }}>
              {STATUS_LABELS[course.status] || course.status}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{course.year}</span>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>{course.name}</h1>
          {course.full_name && <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>{course.full_name}</p>}
        </div>
        <a href={`/courses/${courseId}/config`} style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '7px 14px', borderRadius: '8px',
          border: '1px solid var(--border)', background: 'var(--surface)',
          color: 'var(--text-muted)', fontSize: '13px', textDecoration: 'none',
        }}>
          <i className="ti ti-settings" aria-hidden="true"></i> Editar
        </a>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

        {/* Información general */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px 24px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '14px' }}>
            Información general
          </h3>
          <InfoRow label="Materia" value={course.full_name || course.name} />
          <InfoRow label="Carrera" value={course.career} />
          <InfoRow label="Facultad / Universidad" value={course.faculty} />
          <InfoRow label="Año" value={String(course.year)} />
          <InfoRow label="Modalidad" value={MODALITY_LABELS[course.modality || ''] || course.modality} />
          <InfoRow label="Encuentros esperados" value={String(course.expected_sessions)} />
          <InfoRow label="Días y horarios" value={course.schedule_text} />
          {course.description && (
            <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #f3f4f6' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500, marginBottom: '6px' }}>Descripción</p>
              <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: '1.6' }}>{course.description}</p>
            </div>
          )}
        </div>

        {/* Comisiones y docentes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px 24px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '14px' }}>
              Comisiones
            </h3>
            {commissions.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
                <i className="ti ti-users" style={{ color: 'var(--accent)', fontSize: '15px' }} aria-hidden="true"></i>
                <span style={{ fontSize: '13px', fontWeight: 500 }}>{c.name}</span>
                {c.description && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>— {c.description}</span>}
              </div>
            ))}
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px 24px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '14px' }}>
              Equipo docente
            </h3>
            {permissions.map((p, i) => {
              const com = p.commission_id ? commissions.find(c => c.id === p.commission_id) : null
              const name = (p.profiles as { full_name: string } | null)?.full_name || 'Usuario'
              const permLabels: Record<string, string> = { full: 'Full', edit: 'Edición', read: 'Lectura' }
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
                  <i className="ti ti-user" style={{ color: 'var(--text-muted)', fontSize: '15px' }} aria-hidden="true"></i>
                  <span style={{ fontSize: '13px', fontWeight: 500, flex: 1 }}>{name}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{com ? com.name : 'Todas'}</span>
                  <span style={{
                    fontSize: '10px', fontWeight: 600, padding: '1px 7px', borderRadius: '99px',
                    background: p.permission === 'full' ? '#ede9fe' : p.permission === 'edit' ? '#dbeafe' : '#f3f4f6',
                    color: p.permission === 'full' ? '#7c3aed' : p.permission === 'edit' ? '#1d4ed8' : '#6b7280',
                  }}>
                    {permLabels[p.permission] || p.permission}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Links del curso */}
        {hasAnyLink && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px 24px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '14px' }}>
              Links del curso
            </h3>
            <LinkRow label="Zoom del curso" url={course.zoom_url || ''} icon="ti-video" />
            <LinkRow label="Programa de la materia" url={course.program_url || ''} icon="ti-file-text" />
            <LinkRow label="Aula virtual / Moodle" url={course.moodle_url || ''} icon="ti-school" />
            <LinkRow label="Carpeta de materiales" url={course.materials_url || ''} icon="ti-folder" />
          </div>
        )}

        {/* Notas internas */}
        {course.internal_notes && (
          <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: '12px', padding: '20px 24px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#92400e', marginBottom: '10px' }}>
              <i className="ti ti-lock" style={{ marginRight: '6px' }} aria-hidden="true"></i>
              Observaciones internas
            </h3>
            <p style={{ fontSize: '13px', color: '#78350f', lineHeight: '1.6' }}>{course.internal_notes}</p>
          </div>
        )}
      </div>
    </div>
  )
}
