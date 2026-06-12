'use client'
// src/app/(app)/calendar/page.tsx
// Calendario unificado — muestra encuentros de todos los cursos accesibles

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Session {
  id: string
  course_id: string
  date: string
  class_number: number | null
  title: string
  type: string
  responsible: string
  modality: string
  status: string
  start_time?: string
  end_time?: string
  location?: string
}

interface Course {
  id: string
  name: string
}

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

const COURSE_COLORS = ['#6366f1','#0d9488','#be185d','#d97706','#059669','#7c3aed','#f97316']

function fmtMonth(ym: string) {
  const [y, m] = ym.split('-')
  const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio',
                  'Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  return `${months[parseInt(m) - 1]} ${y}`
}

function fmtDate(d: string) {
  const [y, m, day] = d.split('-')
  const days = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
  const dayName = days[new Date(`${y}-${m}-${day}T12:00:00`).getDay()]
  return { dayName, day: parseInt(day), month: m }
}

function groupByMonth(sessions: (Session & { course: Course })[]) {
  const groups: Record<string, (Session & { course: Course })[]> = {}
  sessions.forEach(s => {
    const key = s.date.slice(0, 7)
    if (!groups[key]) groups[key] = []
    groups[key].push(s)
  })
  return groups
}

export default function UnifiedCalendarPage() {
  const router = useRouter()
  const supabase = createClient()

  const [sessions, setSessions] = useState<(Session & { course: Course })[]>([])
  const [courses,  setCourses]  = useState<Course[]>([])
  const [loading,  setLoading]  = useState(true)
  const [filterStatus,   setFilterStatus]   = useState('all')
  const [filterCourse,   setFilterCourse]   = useState('all')
  const [showOverlapsOnly, setShowOverlapsOnly] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profileData } = await supabase
        .from('profiles').select('global_role').eq('id', user.id).single()

      // Obtener cursos accesibles
      let courseIds: string[] = []
      if (profileData?.global_role === 'admin') {
        const { data } = await supabase.from('courses').select('id, name').not('status', 'eq', 'archived')
        courseIds = (data || []).map(c => c.id)
        setCourses(data || [])
      } else {
        const { data: perms } = await supabase
          .from('user_course_permissions').select('course_id').eq('user_id', user.id)
        courseIds = [...new Set((perms || []).map(p => p.course_id))]
        if (courseIds.length > 0) {
          const { data } = await supabase.from('courses').select('id, name').in('id', courseIds).not('status', 'eq', 'archived')
          setCourses(data || [])
        }
      }

      if (courseIds.length === 0) { setLoading(false); return }

      // Obtener todas las sesiones de esos cursos
      const { data: sessionsData } = await supabase
        .from('sessions')
        .select('id, course_id, date, class_number, title, type, responsible, modality, status, start_time, end_time, location')
        .in('course_id', courseIds)
        .order('date')
        .order('start_time')

      // Unir con datos del curso
      const coursesMap: Record<string, Course> = {}
      courses.forEach(c => { coursesMap[c.id] = c })

      // Re-fetch courses para tenerlos disponibles aquí
      const { data: coursesData } = await supabase.from('courses').select('id, name').in('id', courseIds)
      const cMap: Record<string, Course> = {}
      ;(coursesData || []).forEach(c => { cMap[c.id] = c })

      const enriched = (sessionsData || []).map(s => ({
        ...s,
        course: cMap[s.course_id] || { id: s.course_id, name: 'Curso' },
      }))

      setSessions(enriched)
      setLoading(false)
    }
    load()
  }, [])

  // Detección de superposiciones
  const overlaps = new Set<string>()
  for (let i = 0; i < sessions.length; i++) {
    for (let j = i + 1; j < sessions.length; j++) {
      const a = sessions[i], b = sessions[j]
      if (a.date !== b.date) continue
      if (a.course_id === b.course_id) continue // mismo curso no cuenta
      if (!a.start_time || !b.start_time || !a.end_time || !b.end_time) continue
      if (a.start_time < b.end_time && b.start_time < a.end_time) {
        overlaps.add(a.id)
        overlaps.add(b.id)
      }
    }
  }

  // También detectar misma fecha sin horarios (alerta más suave)
  const sameDayCrossed = new Set<string>()
  const byDate: Record<string, (Session & { course: Course })[]> = {}
  sessions.forEach(s => {
    if (!byDate[s.date]) byDate[s.date] = []
    byDate[s.date].push(s)
  })
  Object.values(byDate).forEach(daySessions => {
    const courses = [...new Set(daySessions.map(s => s.course_id))]
    if (courses.length > 1) {
      daySessions.forEach(s => sameDayCrossed.add(s.id))
    }
  })

  const today = new Date().toISOString().slice(0, 10)

  // Índice de color por curso
  const courseColorMap: Record<string, string> = {}
  courses.forEach((c, i) => { courseColorMap[c.id] = COURSE_COLORS[i % COURSE_COLORS.length] })

  const filtered = sessions.filter(s => {
    if (filterStatus !== 'all' && s.status !== filterStatus) return false
    if (filterCourse !== 'all' && s.course_id !== filterCourse) return false
    if (showOverlapsOnly && !overlaps.has(s.id) && !sameDayCrossed.has(s.id)) return false
    return true
  })

  const grouped = groupByMonth(filtered)

  if (loading) return <div style={{ padding: '24px', color: '#6b7280' }}>Cargando...</div>

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.8.0/tabler-icons.min.css" />

      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Calendario unificado</h2>
        <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
          Todos tus cursos en una sola vista.
        </p>
      </div>

      {/* Leyenda de cursos */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {courses.map(c => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: 'white', border: '1px solid #e5e7eb', borderRadius: '99px', fontSize: '12px', cursor: 'pointer', borderColor: filterCourse === c.id ? courseColorMap[c.id] : '#e5e7eb' }}
            onClick={() => setFilterCourse(filterCourse === c.id ? 'all' : c.id)}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: courseColorMap[c.id], flexShrink: 0 }}></span>
            <span style={{ color: filterCourse === c.id ? courseColorMap[c.id] : '#374151', fontWeight: filterCourse === c.id ? 600 : 400 }}>{c.name}</span>
          </div>
        ))}
        {filterCourse !== 'all' && (
          <button onClick={() => setFilterCourse('all')} style={{ padding: '4px 10px', background: 'none', border: '1px dashed #d1d5db', borderRadius: '99px', fontSize: '12px', color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit' }}>
            Ver todos
          </button>
        )}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Estado</span>
        {[['all','Todas'],['pendiente','Pendiente'],['dada','Dada'],['reprogramada','Reprog.'],['cancelada','Cancelada']].map(([v, l]) => (
          <button key={v} className={`filter-pill${filterStatus===v?' active':''}`} onClick={() => setFilterStatus(v)}>{l}</button>
        ))}
        <span style={{ width: '8px' }}></span>
        <button
          onClick={() => setShowOverlapsOnly(!showOverlapsOnly)}
          style={{
            padding: '4px 12px', borderRadius: '99px', fontSize: '12px', fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit',
            border: showOverlapsOnly ? '1px solid #d97706' : '1px solid #e5e7eb',
            background: showOverlapsOnly ? '#fef3c7' : 'white',
            color: showOverlapsOnly ? '#d97706' : '#6b7280',
          }}
        >
          ⚠ Solo superposiciones
        </button>
      </div>

      {/* Alertas de superposición */}
      {overlaps.size > 0 && (
        <div style={{ padding: '10px 14px', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', color: '#92400e', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="ti ti-alert-triangle" aria-hidden="true"></i>
          <span>
            Se detectaron <strong>{overlaps.size / 2} superposición{overlaps.size / 2 > 1 ? 'es' : ''}</strong> de horarios entre cursos distintos.
            Las clases afectadas están marcadas en naranja.
          </span>
        </div>
      )}

      {/* Agenda */}
      {Object.keys(grouped).length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#6b7280' }}>
          <i className="ti ti-calendar-off" style={{ fontSize: '40px', opacity: 0.3, display: 'block', marginBottom: '12px' }} aria-hidden="true"></i>
          <p>Sin encuentros para mostrar.</p>
        </div>
      ) : (
        Object.entries(grouped).map(([month, monthSessions]) => (
          <div key={month} style={{ marginBottom: '28px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#374151', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="ti ti-calendar-month" style={{ color: '#6366f1' }} aria-hidden="true"></i>
              {fmtMonth(month)}
              <span style={{ fontSize: '12px', fontWeight: 400, color: '#9ca3af' }}>
                ({monthSessions.length} encuentro{monthSessions.length !== 1 ? 's' : ''})
              </span>
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {monthSessions.map(s => {
                const isToday   = s.date === today
                const isPast    = s.date < today && s.status === 'pendiente'
                const isOverlap = overlaps.has(s.id)
                const isSameDay = sameDayCrossed.has(s.id) && !isOverlap
                const dateInfo  = fmtDate(s.date)
                const courseColor = courseColorMap[s.course_id] || '#6b7280'

                return (
                  <div
                    key={s.id}
                    onClick={() => router.push(`/courses/${s.course_id}/calendar`)}
                    style={{
                      background: 'white',
                      border: `1px solid ${isOverlap ? '#fcd34d' : isToday ? '#c7d2fe' : isPast ? '#fecaca' : '#e5e7eb'}`,
                      borderLeft: `4px solid ${courseColor}`,
                      borderRadius: '8px', padding: '12px 16px',
                      display: 'flex', alignItems: 'flex-start', gap: '14px',
                      cursor: 'pointer', transition: 'box-shadow 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)')}
                    onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
                  >
                    {/* Fecha */}
                    <div style={{ width: '56px', flexShrink: 0, textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: isToday ? '#6366f1' : '#6b7280', textTransform: 'uppercase' }}>
                        {dateInfo.dayName}
                      </div>
                      <div style={{ fontSize: '22px', fontWeight: 700, color: isToday ? '#6366f1' : '#111827', lineHeight: 1.1 }}>
                        {dateInfo.day}
                      </div>
                      <div style={{ fontSize: '11px', color: '#9ca3af' }}>/{dateInfo.month}</div>
                    </div>

                    {/* Contenido */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Curso badge */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: courseColor, background: courseColor + '15', padding: '1px 8px', borderRadius: '99px' }}>
                          {s.course.name}
                        </span>
                        <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 7px', borderRadius: '99px', background: (TYPE_COLORS[s.type] || '#6b7280') + '20', color: TYPE_COLORS[s.type] || '#6b7280' }}>
                          {TYPE_LABELS[s.type] || s.type}
                        </span>
                      </div>

                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {s.title}
                      </div>

                      <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: '#6b7280', flexWrap: 'wrap' }}>
                        {s.class_number && <span>Clase {s.class_number}</span>}
                        {s.responsible  && <span><i className="ti ti-user" style={{ fontSize: '11px' }} aria-hidden="true"></i> {s.responsible}</span>}
                        {s.start_time   && <span><i className="ti ti-clock" style={{ fontSize: '11px' }} aria-hidden="true"></i> {s.start_time}{s.end_time ? `–${s.end_time}` : ''}</span>}
                        {s.location     && <span><i className="ti ti-map-pin" style={{ fontSize: '11px' }} aria-hidden="true"></i> {s.location}</span>}
                        <span style={{ color: STATUS_COLORS[s.status] || '#6b7280', fontWeight: 500 }}>
                          {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                        </span>
                      </div>

                      {/* Alertas inline */}
                      <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                        {isOverlap && (
                          <span style={{ fontSize: '11px', padding: '2px 8px', background: '#fef3c7', color: '#92400e', borderRadius: '99px' }}>
                            ⚠ Superposición de horario
                          </span>
                        )}
                        {isSameDay && (
                          <span style={{ fontSize: '11px', padding: '2px 8px', background: '#fff7ed', color: '#c2410c', borderRadius: '99px' }}>
                            📅 Mismo día que otro curso
                          </span>
                        )}
                        {isPast && (
                          <span style={{ fontSize: '11px', padding: '2px 8px', background: '#fee2e2', color: '#dc2626', borderRadius: '99px' }}>
                            Fecha pasada
                          </span>
                        )}
                        {isToday && (
                          <span style={{ fontSize: '11px', padding: '2px 8px', background: '#eef2ff', color: '#4338ca', borderRadius: '99px', fontWeight: 600 }}>
                            Hoy
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Ir al curso */}
                    <div style={{ color: '#d1d5db', fontSize: '16px', flexShrink: 0, alignSelf: 'center' }}>
                      <i className="ti ti-chevron-right" aria-hidden="true"></i>
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
