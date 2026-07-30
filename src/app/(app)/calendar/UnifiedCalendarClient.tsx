'use client'
// src/app/(app)/calendar/page.tsx
// Calendario unificado — muestra encuentros de todos los cursos accesibles

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  type CalendarView, ViewSwitch, MonthNav, MonthGrid, fmtMonthLabel,
  filterWeek, weekRangeLabel,
} from '@/components/calendar/CalendarViews'

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

interface UnifiedCalendarClientProps {
  initialSessions: (Session & { course: Course })[]
  initialCourses: Course[]
}

export default function UnifiedCalendarClient({
  initialSessions, initialCourses,
}: UnifiedCalendarClientProps) {
  const router = useRouter()

  const [sessions] = useState<(Session & { course: Course })[]>(initialSessions)
  const [courses]  = useState<Course[]>(initialCourses)
  const [filterStatus,   setFilterStatus]   = useState('all')
  const [filterCourse,   setFilterCourse]   = useState('all')
  const [showOverlapsOnly, setShowOverlapsOnly] = useState(false)

  // Vista activa y cursores de navegación temporal.
  const [view, setView] = useState<CalendarView>('list')
  const now0 = new Date()
  const [monthCursor, setMonthCursor] = useState({ year: now0.getFullYear(), month: now0.getMonth() })
  const [weekRef, setWeekRef] = useState(new Date())

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

  // Vista Semana: misma lista, acotada a la semana de weekRef.
  const weekFiltered = filterWeek(filtered, weekRef)
  const weekGrouped = groupByMonth(weekFiltered)

  // Vista Mes: eventos coloreados por curso; el click navega al curso.
  const monthEvents = filtered
    .filter(s => s.date?.slice(0, 7) === `${monthCursor.year}-${String(monthCursor.month + 1).padStart(2, '0')}`)
    .map(s => ({
      id: s.id,
      date: s.date,
      title: s.title,
      color: courseColorMap[s.course_id] || 'var(--text-muted)',
      time: s.start_time || undefined,
      muted: s.status === 'cancelada',
      flagPast: s.date < today && s.status === 'pendiente',
    }))

  function monthPrev() { setMonthCursor(c => c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }) }
  function monthNext() { setMonthCursor(c => c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }) }
  function monthToday() { const t = new Date(); setMonthCursor({ year: t.getFullYear(), month: t.getMonth() }) }
  function weekPrev() { setWeekRef(r => new Date(r.getFullYear(), r.getMonth(), r.getDate() - 7)) }
  function weekNext() { setWeekRef(r => new Date(r.getFullYear(), r.getMonth(), r.getDate() + 7)) }
  function weekToday() { setWeekRef(new Date()) }

  function goToCourseBySession(id: string) {
    const s = sessions.find(x => x.id === id)
    if (s) router.push(`/courses/${s.course_id}/calendar`)
  }


  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>

      {/* Header */}
      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Calendario unificado</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Todos tus cursos en una sola vista.
          </p>
        </div>
        <ViewSwitch value={view} onChange={setView} />
      </div>

      {/* Leyenda de cursos */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {courses.map(c => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: 'var(--surface)', border: '1px solid #e5e7eb', borderRadius: '99px', fontSize: '12px', cursor: 'pointer', borderColor: filterCourse === c.id ? courseColorMap[c.id] : '#e5e7eb' }}
            onClick={() => setFilterCourse(filterCourse === c.id ? 'all' : c.id)}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: courseColorMap[c.id], flexShrink: 0 }}></span>
            <span style={{ color: filterCourse === c.id ? courseColorMap[c.id] : 'var(--text-secondary)', fontWeight: filterCourse === c.id ? 600 : 400 }}>{c.name}</span>
          </div>
        ))}
        {filterCourse !== 'all' && (
          <button onClick={() => setFilterCourse('all')} style={{ padding: '4px 10px', background: 'none', border: '1px dashed #d1d5db', borderRadius: '99px', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit' }}>
            Ver todos
          </button>
        )}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Estado</span>
        {[['all','Todas'],['pendiente','Pendiente'],['dada','Dada'],['reprogramada','Reprog.'],['cancelada','Cancelada']].map(([v, l]) => (
          <button key={v} className={`filter-pill${filterStatus===v?' active':''}`} onClick={() => setFilterStatus(v)}>{l}</button>
        ))}
        <span style={{ width: '8px' }}></span>
        <button
          onClick={() => setShowOverlapsOnly(!showOverlapsOnly)}
          style={{
            padding: '4px 12px', borderRadius: '99px', fontSize: '12px', fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit',
            border: showOverlapsOnly ? '1px solid var(--badge-warning-bd)' : '1px solid var(--border)',
            background: showOverlapsOnly ? 'var(--badge-warning-bg)' : 'var(--surface)',
            color: showOverlapsOnly ? 'var(--badge-warning-fg)' : 'var(--text-muted)',
          }}
        >
          ⚠ Solo superposiciones
        </button>
      </div>

      {/* Alertas de superposición */}
      {overlaps.size > 0 && (
        <div style={{ padding: '10px 14px', background: 'var(--badge-warning-bg)', border: '1px solid var(--badge-warning-bd)', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', color: 'var(--badge-warning-fg)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="ti ti-alert-triangle" aria-hidden="true"></i>
          <span>
            Se detectaron <strong>{overlaps.size / 2} superposición{overlaps.size / 2 > 1 ? 'es' : ''}</strong> de horarios entre cursos distintos.
            Las clases afectadas están marcadas en naranja.
          </span>
        </div>
      )}

      {/* Barra de navegación temporal según vista */}
      {view === 'month' && (
        <div style={{ marginBottom: '16px' }}>
          <MonthNav label={fmtMonthLabel(monthCursor.year, monthCursor.month)} onPrev={monthPrev} onNext={monthNext} onToday={monthToday} />
        </div>
      )}
      {view === 'week' && (
        <div style={{ marginBottom: '16px' }}>
          <MonthNav label={weekRangeLabel(weekRef)} onPrev={weekPrev} onNext={weekNext} onToday={weekToday} />
        </div>
      )}

      {/* Vista Mes */}
      {view === 'month' && (
        <MonthGrid year={monthCursor.year} month0={monthCursor.month} events={monthEvents} today={today} onEventClick={goToCourseBySession} />
      )}

      {/* Vistas Lista y Semana */}
      {view !== 'month' && (() => {
        const listData = view === 'week' ? weekGrouped : grouped
        return Object.keys(listData).length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
          <i className="ti ti-calendar-off" style={{ fontSize: '40px', opacity: 0.3, display: 'block', marginBottom: '12px' }} aria-hidden="true"></i>
          <p>{view === 'week' ? 'Sin encuentros esta semana.' : 'Sin encuentros para mostrar.'}</p>
        </div>
      ) : (
        Object.entries(listData).map(([month, monthSessions]) => (
          <div key={month} style={{ marginBottom: '28px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="ti ti-calendar-month" style={{ color: 'var(--accent)' }} aria-hidden="true"></i>
              {fmtMonth(month)}
              <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-muted)' }}>
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
                const courseColor = courseColorMap[s.course_id] || 'var(--text-muted)'

                return (
                  <div
                    key={s.id}
                    onClick={() => router.push(`/courses/${s.course_id}/calendar`)}
                    style={{
                      background: 'var(--surface)',
                      border: `1px solid ${isOverlap ? 'var(--warning)' : isToday ? 'var(--accent)' : isPast ? 'var(--danger)' : 'var(--border)'}`,
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
                      <div style={{ fontSize: '11px', fontWeight: 600, color: isToday ? 'var(--accent)' : 'var(--text-muted)', textTransform: 'uppercase' }}>
                        {dateInfo.dayName}
                      </div>
                      <div style={{ fontSize: '22px', fontWeight: 700, color: isToday ? 'var(--accent)' : 'var(--text-primary)', lineHeight: 1.1 }}>
                        {dateInfo.day}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>/{dateInfo.month}</div>
                    </div>

                    {/* Contenido */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Curso badge */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: courseColor, background: courseColor + '15', padding: '1px 8px', borderRadius: '99px' }}>
                          {s.course.name}
                        </span>
                        <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 7px', borderRadius: '99px', background: (TYPE_COLORS[s.type] || 'var(--text-muted)') + '20', color: TYPE_COLORS[s.type] || 'var(--text-muted)' }}>
                          {TYPE_LABELS[s.type] || s.type}
                        </span>
                      </div>

                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {s.title}
                      </div>

                      <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                        {s.class_number && <span>Clase {s.class_number}</span>}
                        {s.responsible  && <span><i className="ti ti-user" style={{ fontSize: '11px' }} aria-hidden="true"></i> {s.responsible}</span>}
                        {s.start_time   && <span><i className="ti ti-clock" style={{ fontSize: '11px' }} aria-hidden="true"></i> {s.start_time}{s.end_time ? `–${s.end_time}` : ''}</span>}
                        {s.location     && <span><i className="ti ti-map-pin" style={{ fontSize: '11px' }} aria-hidden="true"></i> {s.location}</span>}
                        <span style={{ color: STATUS_COLORS[s.status] || 'var(--text-muted)', fontWeight: 500 }}>
                          {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                        </span>
                      </div>

                      {/* Alertas inline */}
                      <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                        {isOverlap && (
                          <span style={{ fontSize: '11px', padding: '2px 8px', background: 'var(--badge-warning-bg)', color: 'var(--badge-warning-fg)', borderRadius: '99px' }}>
                            ⚠ Superposición de horario
                          </span>
                        )}
                        {isSameDay && (
                          <span style={{ fontSize: '11px', padding: '2px 8px', background: '#fff7ed', color: 'var(--badge-orange-fg)', borderRadius: '99px' }}>
                            📅 Mismo día que otro curso
                          </span>
                        )}
                        {isPast && (
                          <span style={{ fontSize: '11px', padding: '2px 8px', background: 'var(--badge-danger-bg)', color: 'var(--badge-danger-fg)', borderRadius: '99px' }}>
                            Fecha pasada
                          </span>
                        )}
                        {isToday && (
                          <span style={{ fontSize: '11px', padding: '2px 8px', background: 'var(--chip-accent-bg)', color: 'var(--chip-accent-fg)', borderRadius: '99px', fontWeight: 600 }}>
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
        )
      })()}
    </div>
  )
}
