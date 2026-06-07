'use client'
// src/app/(app)/courses/[courseId]/calendar/page.tsx

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Session {
  id: string; course_id: string; date: string; class_number: number | null
  title: string; type: string; responsible: string; modality: string
  status: string; commission_scope: string
  start_time?: string; end_time?: string; location?: string; canva_url?: string
}
interface Commission { id: string; name: string }

const TYPE_COLORS: Record<string, string> = {
  teorica: '#6366f1', practica: '#0d9488', taller: '#d97706',
  invitado: '#be185d', parcial: '#dc2626', recuperatorio: '#f97316',
  exposicion: '#7c3aed', proyecto: '#059669',
}
const TYPE_LABELS: Record<string, string> = {
  teorica: 'Teórica', practica: 'Práctica', taller: 'Taller',
  invitado: 'Invitado', parcial: 'Parcial', recuperatorio: 'Recuperatorio',
  exposicion: 'Exposición', proyecto: 'Proyecto',
}
const STATUS_COLORS: Record<string, string> = {
  dada: '#059669', pendiente: '#6b7280', reprogramada: '#d97706', cancelada: '#dc2626',
}

function groupByMonth(sessions: Session[]) {
  const groups: Record<string, Session[]> = {}
  sessions.forEach(s => {
    const key = s.date.slice(0, 7) // YYYY-MM
    if (!groups[key]) groups[key] = []
    groups[key].push(s)
  })
  return groups
}

function fmtMonth(ym: string) {
  const [y, m] = ym.split('-')
  const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  return `${months[parseInt(m) - 1]} ${y}`
}

function fmtDate(d: string) {
  const [y, m, day] = d.split('-')
  const days = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
  const dayName = days[new Date(`${y}-${m}-${day}T12:00:00`).getDay()]
  return `${dayName} ${parseInt(day)}/${m}`
}

export default function CalendarPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const supabase = createClient()

  const [sessions, setSessions] = useState<Session[]>([])
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [courseName, setCourseName] = useState('')
  const [zoomUrl, setZoomUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('all')

  const load = useCallback(async () => {
    const [courseRes, sessionsRes, commsRes] = await Promise.all([
      supabase.from('courses').select('name, zoom_url').eq('id', courseId).single(),
      supabase.from('sessions').select('*').eq('course_id', courseId).order('date').order('start_time'),
      supabase.from('commissions').select('id, name').eq('course_id', courseId),
    ])
    setCourseName(courseRes.data?.name || '')
    setZoomUrl(courseRes.data?.zoom_url || '')
    setSessions(sessionsRes.data || [])
    setCommissions(commsRes.data || [])
    setLoading(false)
  }, [courseId])

  useEffect(() => { load() }, [load])

  const filtered = sessions.filter(s =>
    filterStatus === 'all' || s.status === filterStatus
  )

  const grouped = groupByMonth(filtered)
  const today = new Date().toISOString().slice(0, 10)

  // Detectar superposiciones (clases el mismo día con horarios cruzados y con start/end_time)
  const overlaps = new Set<string>()
  for (let i = 0; i < sessions.length; i++) {
    for (let j = i + 1; j < sessions.length; j++) {
      const a = sessions[i], b = sessions[j]
      if (a.date !== b.date) continue
      if (!a.start_time || !b.start_time || !a.end_time || !b.end_time) continue
      if (a.start_time < b.end_time && b.start_time < a.end_time) {
        overlaps.add(a.id)
        overlaps.add(b.id)
      }
    }
  }

  if (loading) return <div style={{ padding: '24px', color: '#6b7280' }}>Cargando...</div>

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.8.0/tabler-icons.min.css" />

      <div style={{ marginBottom: '20px' }}>
        <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '2px' }}>{courseName}</p>
        <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Agenda</h2>
      </div>

      {/* Zoom del curso */}
      {zoomUrl && (
        <a href={zoomUrl} target="_blank" rel="noopener noreferrer" style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '16px',
          padding: '8px 16px', background: '#eef2ff', border: '1px solid #c7d2fe',
          borderRadius: '8px', color: '#4338ca', fontSize: '13px', fontWeight: 500, textDecoration: 'none',
        }}>
          <i className="ti ti-video" aria-hidden="true"></i>
          Zoom del curso
          <i className="ti ti-external-link" style={{ fontSize: '11px', opacity: 0.6 }} aria-hidden="true"></i>
        </a>
      )}

      {/* Alerta de superposiciones */}
      {overlaps.size > 0 && (
        <div style={{ padding: '10px 14px', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', color: '#92400e', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="ti ti-alert-triangle" aria-hidden="true"></i>
          <span>Se detectaron <strong>{overlaps.size / 2} posibles superposiciones</strong> de horarios. Las clases afectadas están marcadas en naranja.</span>
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {[['all','Todas'],['pendiente','Pendiente'],['dada','Dada'],['reprogramada','Reprog.'],['cancelada','Cancelada']].map(([v, l]) => (
          <button key={v}
            className={`filter-pill${filterStatus === v ? ' active' : ''}`}
            onClick={() => setFilterStatus(v)}>{l}</button>
        ))}
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#6b7280' }}>
          <i className="ti ti-calendar-off" style={{ fontSize: '40px', opacity: 0.3, display: 'block', marginBottom: '12px' }} aria-hidden="true"></i>
          <p>Sin encuentros para mostrar.</p>
        </div>
      ) : (
        Object.entries(grouped).map(([month, monthSessions]) => (
          <div key={month} style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#374151', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="ti ti-calendar-month" style={{ color: '#6366f1' }} aria-hidden="true"></i>
              {fmtMonth(month)}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {monthSessions.map(s => {
                const isToday = s.date === today
                const isPast = s.date < today && s.status === 'pendiente'
                const isOverlap = overlaps.has(s.id)
                const com = commissions.find(c => c.id === s.commission_scope)
                const showZoom = s.modality === 'virtual' && !s.canva_url && zoomUrl

                return (
                  <div key={s.id} style={{
                    background: 'white',
                    border: `1px solid ${isOverlap ? '#fcd34d' : isToday ? '#c7d2fe' : isPast ? '#fecaca' : '#e5e7eb'}`,
                    borderLeft: `4px solid ${TYPE_COLORS[s.type] || '#6b7280'}`,
                    borderRadius: '8px', padding: '12px 16px',
                    display: 'flex', alignItems: 'flex-start', gap: '14px',
                  }}>
                    {/* Fecha */}
                    <div style={{ width: '60px', flexShrink: 0, textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: isToday ? '#6366f1' : '#6b7280', textTransform: 'uppercase' }}>
                        {fmtDate(s.date).split(' ')[0]}
                      </div>
                      <div style={{ fontSize: '22px', fontWeight: 700, color: isToday ? '#6366f1' : '#111827', lineHeight: 1.1 }}>
                        {fmtDate(s.date).split(' ')[1]?.split('/')[0]}
                      </div>
                    </div>

                    {/* Contenido */}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 600, flex: 1 }}>{s.title}</span>
                        <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '99px', background: TYPE_COLORS[s.type] + '20', color: TYPE_COLORS[s.type], flexShrink: 0 }}>
                          {TYPE_LABELS[s.type] || s.type}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: '#6b7280', flexWrap: 'wrap' }}>
                        {s.class_number && <span>Clase {s.class_number}</span>}
                        {s.responsible && <span><i className="ti ti-user" style={{ fontSize: '11px' }} aria-hidden="true"></i> {s.responsible}</span>}
                        {s.start_time && <span><i className="ti ti-clock" style={{ fontSize: '11px' }} aria-hidden="true"></i> {s.start_time}{s.end_time ? `–${s.end_time}` : ''}</span>}
                        {s.location && <span><i className="ti ti-map-pin" style={{ fontSize: '11px' }} aria-hidden="true"></i> {s.location}</span>}
                        {com && <span><i className="ti ti-users" style={{ fontSize: '11px' }} aria-hidden="true"></i> {com.name}</span>}
                        <span style={{ color: STATUS_COLORS[s.status] || '#6b7280', fontWeight: 500 }}>
                          {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                        </span>
                      </div>
                      {(isOverlap || isPast || showZoom) && (
                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                          {isOverlap && (
                            <span style={{ fontSize: '11px', padding: '2px 8px', background: '#fef3c7', color: '#92400e', borderRadius: '99px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                              <i className="ti ti-alert-triangle" style={{ fontSize: '11px' }} aria-hidden="true"></i> Posible superposición
                            </span>
                          )}
                          {isPast && (
                            <span style={{ fontSize: '11px', padding: '2px 8px', background: '#fee2e2', color: '#dc2626', borderRadius: '99px' }}>
                              Fecha pasada
                            </span>
                          )}
                          {showZoom && (
                            <a href={zoomUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', padding: '2px 8px', background: '#eef2ff', color: '#4338ca', borderRadius: '99px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}>
                              <i className="ti ti-video" style={{ fontSize: '11px' }} aria-hidden="true"></i> Zoom del curso
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
