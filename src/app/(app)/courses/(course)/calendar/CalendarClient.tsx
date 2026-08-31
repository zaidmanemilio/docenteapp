'use client'
// src/app/(app)/courses/[courseId]/calendar/page.tsx
// Fix: abre SessionModal al hacer click en un encuentro

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Commission, AdditionalLink } from '@/types'
import SessionModal, { type ExtendedSession } from '@/components/schedule/SessionModal'
import {
  type CalendarView, ViewSwitch, MonthNav, MonthGrid, fmtMonthLabel,
  filterWeek, weekRangeLabel,
} from '@/components/calendar/CalendarViews'

const TYPE_COLORS: Record<string, string> = {
  teorica:'#6366f1', practica:'#0d9488', taller:'#d97706',
  invitado:'#be185d', parcial:'#dc2626', recuperatorio:'#f97316',
  exposicion:'#7c3aed', proyecto:'#059669',
}
const TYPE_LABELS: Record<string, string> = {
  teorica:'Teórica', practica:'Práctica', taller:'Taller',
  invitado:'Invitado', parcial:'Parcial', recuperatorio:'Recuperatorio',
  exposicion:'Exposición', proyecto:'Proyecto',
}
const STATUS_COLORS: Record<string, string> = {
  dada:'var(--success)', pendiente:'var(--text-muted)', reprogramada:'var(--warning)', cancelada:'var(--danger)',
}

function groupByMonth(sessions: ExtendedSession[]) {
  const groups: Record<string, ExtendedSession[]> = {}
  sessions.forEach(s => {
    const key = s.date.slice(0, 7)
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

interface CalendarClientProps {
  courseId: string
  courseName: string
  zoomUrl: string
  coursePermission: string | null
  initialSessions: ExtendedSession[]
  initialCommissions: Commission[]
}

export default function CalendarClient({
  courseId, courseName, zoomUrl, coursePermission,
  initialSessions, initialCommissions,
}: CalendarClientProps) {
  const supabase = createClient()

  const [sessions,     setSessions]     = useState<ExtendedSession[]>(initialSessions)
  const [commissions]                   = useState<Commission[]>(initialCommissions)
  const [filterStatus, setFilterStatus] = useState('all')

  // Vista activa (lista / semana / mes) y cursor de navegación temporal.
  const [view, setView] = useState<CalendarView>('list')
  const now0 = new Date()
  const [monthCursor, setMonthCursor] = useState({ year: now0.getFullYear(), month: now0.getMonth() })
  const [weekRef, setWeekRef] = useState(new Date())

  // Estado del modal (igual que en schedule)
  const [editSession, setEditSession] = useState<ExtendedSession | null>(null)
  const [addLinks,    setAddLinks]    = useState<AdditionalLink[]>([])
  const [saving,      setSaving]      = useState(false)

  // Solo relee los encuentros tras editar/guardar. El curso, las comisiones y
  // el permiso los resuelve el servidor y no cambian mientras estás acá.
  const load = useCallback(async () => {
    const { data } = await supabase
      .from('sessions')
      .select('*')
      .eq('course_id', courseId)
      .order('date')
      .order('start_time')
    setSessions(data || [])
  }, [courseId, supabase])

  const canEdit  = coursePermission === 'full' || coursePermission === 'edit'
  const canDelete = coursePermission === 'full'

  const filtered = sessions.filter(s =>
    filterStatus === 'all' || s.status === filterStatus
  )

  const grouped = groupByMonth(filtered)
  const today = new Date().toISOString().slice(0, 10)

  // Vista Semana: misma lista de cards, acotada a la semana de weekRef.
  const weekFiltered = filterWeek(filtered, weekRef)
  const weekGrouped = groupByMonth(weekFiltered)

  // Vista Mes: convierte sesiones del mes visible en eventos de la grilla.
  const monthEvents = filtered
    .filter(s => s.date?.slice(0, 7) === `${monthCursor.year}-${String(monthCursor.month + 1).padStart(2, '0')}`)
    .map(s => ({
      id: s.id as string,
      date: s.date,
      title: s.title,
      color: TYPE_COLORS[s.type] || 'var(--text-muted)',
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

  // Abre el modal a partir de un id (usado por la grilla mensual).
  function openEditById(id: string) {
    const s = sessions.find(x => x.id === id)
    if (s) openEdit(s)
  }

  // Detección de superposición
  const overlaps = new Set<string>()
  for (let i = 0; i < sessions.length; i++) {
    for (let j = i + 1; j < sessions.length; j++) {
      const a = sessions[i], b = sessions[j]
      if (a.date !== b.date) continue
      if (!a.start_time || !b.start_time || !a.end_time || !b.end_time) continue
      if (a.start_time < b.end_time && b.start_time < a.end_time) {
        overlaps.add(a.id as string)
        overlaps.add(b.id as string)
      }
    }
  }

  function openEdit(s: ExtendedSession) {
    setEditSession({ ...s })
    setAddLinks([...(s.additional_links || [])])
  }

  function handleClose() { setEditSession(null) }

  async function handleSave() {
    if (!editSession) return
    if (!canEdit) { alert('No tenés permiso para editar encuentros en este curso.'); return }
    if (!editSession.title || !editSession.date) { alert('Título y fecha son obligatorios.'); return }
    setSaving(true)
    const { id, created_at, updated_at, ...payload } = editSession as ExtendedSession & { created_at: string; updated_at: string }
    const { error } = await supabase.from('sessions')
      .update({ ...payload, additional_links: addLinks, updated_at: new Date().toISOString() })
      .eq('id', id)
    setSaving(false)
    if (error) {
      alert(`No se pudo guardar el encuentro:\n\n${error.message}`)
      return
    }
    setEditSession(null)
    load()
  }

  async function handleDelete() {
    if (!editSession?.id) return
    if (!canDelete) { alert('No tenés permiso para eliminar encuentros.'); return }
    if (!confirm('¿Eliminar este encuentro?')) return
    await supabase.from('sessions').delete().eq('id', editSession.id)
    setEditSession(null)
    load()
  }


  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>

      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '2px' }}>{courseName}</p>
          <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Agenda</h2>
        </div>
        <ViewSwitch value={view} onChange={setView} />
      </div>

      {zoomUrl && (
        <a href={zoomUrl} target="_blank" rel="noopener noreferrer" style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '16px',
          padding: '8px 16px', background: 'var(--chip-accent-bg)', border: '1px solid var(--chip-accent-bd)',
          borderRadius: '8px', color: 'var(--chip-accent-fg)', fontSize: '13px', fontWeight: 500, textDecoration: 'none',
        }}>
          <i className="ti ti-video" aria-hidden="true"></i>
          Zoom del curso
          <i className="ti ti-external-link" style={{ fontSize: '11px', opacity: 0.6 }} aria-hidden="true"></i>
        </a>
      )}

      {overlaps.size > 0 && (
        <div style={{ padding: '10px 14px', background: 'var(--badge-warning-bg)', border: '1px solid var(--badge-warning-bd)', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', color: 'var(--badge-warning-fg)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="ti ti-alert-triangle" aria-hidden="true"></i>
          <span>Se detectaron posibles superposiciones de horarios. Las clases afectadas están marcadas.</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {[['all','Todas'],['pendiente','Pendiente'],['dada','Dada'],['reprogramada','Reprog.'],['cancelada','Cancelada']].map(([v, l]) => (
          <button key={v} className={`filter-pill${filterStatus===v?' active':''}`} onClick={() => setFilterStatus(v)}>{l}</button>
        ))}
      </div>

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
        <MonthGrid year={monthCursor.year} month0={monthCursor.month} events={monthEvents} today={today} onEventClick={openEditById} />
      )}

      {/* Vistas Lista y Semana (mismo render de cards) */}
      {view !== 'month' && (() => {
        const listData = view === 'week' ? weekGrouped : grouped
        return Object.keys(listData).length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
            <i className="ti ti-calendar-off" style={{ fontSize: '40px', opacity: 0.3, display: 'block', marginBottom: '12px' }} aria-hidden="true"></i>
            <p>{view === 'week' ? 'Sin encuentros esta semana.' : 'Sin encuentros para mostrar.'}</p>
          </div>
        ) : (
          Object.entries(listData).map(([month, monthSessions]) => (
          <div key={month} style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="ti ti-calendar-month" style={{ color: 'var(--accent)' }} aria-hidden="true"></i>
              {fmtMonth(month)}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {monthSessions.map(s => {
                const isToday    = s.date === today
                const isPast     = s.date < today && s.status === 'pendiente'
                const isOverlap  = overlaps.has(s.id as string)
                const com        = commissions.find(c => c.id === s.commission_scope)
                const showZoom   = s.modality === 'virtual' && !s.canva_url && zoomUrl

                return (
                  <div
                    key={s.id}
                    onClick={() => openEdit(s)}
                    style={{
                      background: 'var(--surface)',
                      border: `1px solid ${isOverlap ? 'var(--warning)' : isToday ? 'var(--accent)' : isPast ? 'var(--danger)' : 'var(--border)'}`,
                      borderLeft: `4px solid ${TYPE_COLORS[s.type] || 'var(--text-muted)'}`,
                      borderRadius: '8px', padding: '12px 16px',
                      display: 'flex', alignItems: 'flex-start', gap: '14px',
                      cursor: 'pointer',
                      transition: 'box-shadow 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)')}
                    onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
                  >
                    {/* Fecha */}
                    <div style={{ width: '60px', flexShrink: 0, textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: isToday ? 'var(--accent)' : 'var(--text-muted)', textTransform: 'uppercase' }}>
                        {fmtDate(s.date).split(' ')[0]}
                      </div>
                      <div style={{ fontSize: '22px', fontWeight: 700, color: isToday ? 'var(--accent)' : 'var(--text-primary)', lineHeight: 1.1 }}>
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
                      <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                        {s.class_number && <span>Clase {s.class_number}</span>}
                        {s.responsible  && <span><i className="ti ti-user" style={{ fontSize: '11px' }} aria-hidden="true"></i> {s.responsible}</span>}
                        {s.start_time   && <span><i className="ti ti-clock" style={{ fontSize: '11px' }} aria-hidden="true"></i> {s.start_time}{s.end_time ? `–${s.end_time}` : ''}</span>}
                        {s.location     && <span><i className="ti ti-map-pin" style={{ fontSize: '11px' }} aria-hidden="true"></i> {s.location}</span>}
                        {com            && <span><i className="ti ti-users" style={{ fontSize: '11px' }} aria-hidden="true"></i> {com.name}</span>}
                        <span style={{ color: STATUS_COLORS[s.status] || 'var(--text-muted)', fontWeight: 500 }}>
                          {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                        </span>
                      </div>
                      {(isOverlap || isPast || showZoom) && (
                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                          {isOverlap && (
                            <span style={{ fontSize: '11px', padding: '2px 8px', background: 'var(--badge-warning-bg)', color: 'var(--badge-warning-fg)', borderRadius: '99px' }}>
                              ⚠ Posible superposición
                            </span>
                          )}
                          {isPast && (
                            <span style={{ fontSize: '11px', padding: '2px 8px', background: 'var(--badge-danger-bg)', color: 'var(--badge-danger-fg)', borderRadius: '99px' }}>
                              Fecha pasada
                            </span>
                          )}
                          {showZoom && (
                            <a href={zoomUrl} target="_blank" rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              style={{ fontSize: '11px', padding: '2px 8px', background: 'var(--chip-accent-bg)', color: 'var(--chip-accent-fg)', borderRadius: '99px', textDecoration: 'none' }}>
                              📹 Zoom del curso
                            </a>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Indicador de editable */}
                    {canEdit && (
                      <div style={{ color: '#d1d5db', fontSize: '16px', flexShrink: 0, alignSelf: 'center' }}>
                        <i className="ti ti-pencil" aria-hidden="true"></i>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))
        )
      })()}

      {/* Modal — mismo componente que Cronograma */}
      {editSession && (
        <SessionModal
          session={editSession}
          isNew={false}
          commissions={commissions}
          addLinks={addLinks}
          canEdit={canEdit}
          isAdmin={canDelete}
          saving={saving}
          onClose={handleClose}
          onSave={handleSave}
          onDelete={handleDelete}
          onSessionChange={setEditSession}
          onAddLinksChange={setAddLinks}
        />
      )}
    </div>
  )
}
