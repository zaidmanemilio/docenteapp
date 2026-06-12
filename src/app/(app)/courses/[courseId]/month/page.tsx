'use client'
// src/app/(app)/courses/[courseId]/month/page.tsx
// Vista de calendario mensual (grilla). Reutiliza SessionModal, permisos y
// colores de la Agenda. No reemplaza la Agenda cronológica: convive con ella.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Commission, AdditionalLink } from '@/types'
import SessionModal, { type ExtendedSession } from '@/components/schedule/SessionModal'

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

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const WEEKDAYS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']

// Convierte 'YYYY-MM' a etiqueta legible.
function fmtMonth(ym: string) {
  const [y, m] = ym.split('-')
  return `${MONTHS[parseInt(m) - 1]} ${y}`
}

// Día de la semana lunes=0 ... domingo=6 para una fecha YYYY-MM-DD (sin TZ).
function mondayFirstIndex(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const js = new Date(y, m - 1, d).getDay() // 0=Dom ... 6=Sáb
  return (js + 6) % 7
}

// Devuelve la grilla de semanas (cada celda es 'YYYY-MM-DD' o null) para un mes.
function buildMonthGrid(year: number, month0: number) {
  const first = `${year}-${String(month0 + 1).padStart(2, '0')}-01`
  const lead = mondayFirstIndex(first)
  const daysInMonth = new Date(year, month0 + 1, 0).getDate()

  const cells: (string | null)[] = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  while (cells.length % 7 !== 0) cells.push(null)

  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export default function MonthPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const supabase = createClient()

  const [sessions,    setSessions]    = useState<ExtendedSession[]>([])
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [courseName,  setCourseName]  = useState('')
  const [zoomUrl,     setZoomUrl]     = useState('')
  const [loading,     setLoading]     = useState(true)
  const [coursePermission, setCoursePermission] = useState<string | null>(null)

  // Mes visible (inicial: hoy). Guardamos año y mes (0-based).
  const now = new Date()
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() })

  // Estado del modal — idéntico a la Agenda.
  const [editSession, setEditSession] = useState<ExtendedSession | null>(null)
  const [addLinks,    setAddLinks]    = useState<AdditionalLink[]>([])
  const [saving,      setSaving]      = useState(false)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [profileRes, courseRes, sessionsRes, commsRes, permRes] = await Promise.all([
      supabase.from('profiles').select('global_role').eq('id', user.id).single(),
      supabase.from('courses').select('name, zoom_url').eq('id', courseId).single(),
      supabase.from('sessions').select('*').eq('course_id', courseId).order('date').order('start_time'),
      supabase.from('commissions').select('*').eq('course_id', courseId),
      supabase.from('user_course_permissions').select('permission').eq('user_id', user.id).eq('course_id', courseId),
    ])

    const globalRole = profileRes.data?.global_role
    if (globalRole === 'admin') {
      setCoursePermission('full')
    } else {
      const PERM_RANK: Record<string, number> = { full: 3, edit: 2, read: 1 }
      const best = (permRes.data || []).reduce((acc: string | null, row) => {
        if (!acc) return row.permission
        return (PERM_RANK[row.permission] || 0) > (PERM_RANK[acc] || 0) ? row.permission : acc
      }, null)
      setCoursePermission(best)
    }

    setCourseName(courseRes.data?.name || '')
    setZoomUrl(courseRes.data?.zoom_url || '')
    setSessions(sessionsRes.data || [])
    setCommissions(commsRes.data || [])
    setLoading(false)
  }, [courseId])

  useEffect(() => { load() }, [load])

  const canEdit   = coursePermission === 'full' || coursePermission === 'edit'
  const canDelete = coursePermission === 'full'

  // Índice de sesiones por fecha YYYY-MM-DD para lookup O(1) por celda.
  const byDate = useMemo(() => {
    const map: Record<string, ExtendedSession[]> = {}
    sessions.forEach(s => {
      if (!s.date) return
      if (!map[s.date]) map[s.date] = []
      map[s.date].push(s)
    })
    return map
  }, [sessions])

  // Meses que tienen al menos un encuentro (para el botón "ir al primero").
  const monthsWithSessions = useMemo(() => {
    const set = new Set<string>()
    sessions.forEach(s => { if (s.date) set.add(s.date.slice(0, 7)) })
    return Array.from(set).sort()
  }, [sessions])

  const weeks = buildMonthGrid(cursor.year, cursor.month)
  const ymKey = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`
  const today = new Date().toISOString().slice(0, 10)

  function goPrev() {
    setCursor(c => c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 })
  }
  function goNext() {
    setCursor(c => c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 })
  }
  function goToday() {
    const t = new Date()
    setCursor({ year: t.getFullYear(), month: t.getMonth() })
  }
  function goFirstWithSessions() {
    if (monthsWithSessions.length === 0) return
    const [y, m] = monthsWithSessions[0].split('-').map(Number)
    setCursor({ year: y, month: m - 1 })
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
    await supabase.from('sessions')
      .update({ ...payload, additional_links: addLinks, updated_at: new Date().toISOString() })
      .eq('id', id)
    setSaving(false)
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

  if (loading) return <div style={{ padding: '24px', color: '#6b7280' }}>Cargando...</div>

  const monthHasSessions = sessions.some(s => s.date?.slice(0, 7) === ymKey)

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.8.0/tabler-icons.min.css" />

      <div style={{ marginBottom: '20px' }}>
        <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '2px' }}>{courseName}</p>
        <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Mes</h2>
      </div>

      {/* Barra de navegación de mes */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button onClick={goPrev} aria-label="Mes anterior" style={navBtn}>
          <i className="ti ti-chevron-left" aria-hidden="true"></i>
        </button>
        <div style={{ fontSize: '16px', fontWeight: 700, color: '#111827', minWidth: '170px', textAlign: 'center' }}>
          {fmtMonth(ymKey)}
        </div>
        <button onClick={goNext} aria-label="Mes siguiente" style={navBtn}>
          <i className="ti ti-chevron-right" aria-hidden="true"></i>
        </button>
        <button onClick={goToday} className="filter-pill" style={{ marginLeft: '8px' }}>Hoy</button>
        {!monthHasSessions && monthsWithSessions.length > 0 && (
          <button onClick={goFirstWithSessions} className="filter-pill">
            Ir al primer mes con clases
          </button>
        )}
      </div>

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

      {/* Encabezado de días */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', marginBottom: '6px' }}>
        {WEEKDAYS.map(d => (
          <div key={d} style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', textAlign: 'center', padding: '4px 0' }}>
            {d}
          </div>
        ))}
      </div>

      {/* Grilla de semanas */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
            {week.map((dateStr, di) => {
              if (!dateStr) {
                return <div key={di} style={{ minHeight: '92px', background: '#fafafa', borderRadius: '8px' }} />
              }
              const dayNum    = parseInt(dateStr.slice(8, 10))
              const isToday   = dateStr === today
              const daySess   = byDate[dateStr] || []

              return (
                <div key={di} style={{
                  minHeight: '92px',
                  background: 'white',
                  border: `1px solid ${isToday ? '#c7d2fe' : '#e5e7eb'}`,
                  borderRadius: '8px',
                  padding: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}>
                  <div style={{
                    fontSize: '12px', fontWeight: isToday ? 700 : 600,
                    color: isToday ? '#6366f1' : '#374151', textAlign: 'right', lineHeight: 1,
                  }}>
                    {dayNum}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', overflow: 'hidden' }}>
                    {daySess.map(s => {
                      const isPast    = s.date < today && s.status === 'pendiente'
                      const isCancel  = s.status === 'cancelada'
                      const color     = TYPE_COLORS[s.type] || '#6b7280'
                      return (
                        <button
                          key={s.id}
                          onClick={() => openEdit(s)}
                          title={`${s.title}${s.start_time ? ` · ${s.start_time}${s.end_time ? '–' + s.end_time : ''}` : ''} · ${TYPE_LABELS[s.type] || s.type}`}
                          style={{
                            textAlign: 'left',
                            border: 'none',
                            borderLeft: `3px solid ${color}`,
                            background: color + '14',
                            color: isCancel ? '#9ca3af' : '#111827',
                            textDecoration: isCancel ? 'line-through' : 'none',
                            borderRadius: '4px',
                            padding: '3px 5px',
                            fontSize: '11px',
                            lineHeight: 1.2,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            opacity: isCancel ? 0.7 : 1,
                          }}
                        >
                          {s.start_time && (
                            <span style={{ color: '#6b7280', marginRight: '4px' }}>{s.start_time.slice(0, 5)}</span>
                          )}
                          {isPast && <span style={{ color: '#dc2626', marginRight: '3px' }}>●</span>}
                          {s.title}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Leyenda de tipos */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '16px' }}>
        {Object.entries(TYPE_LABELS).map(([k, label]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#6b7280' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: TYPE_COLORS[k], display: 'inline-block' }} />
            {label}
          </div>
        ))}
      </div>

      {/* Modal — mismo componente que Cronograma y Agenda */}
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

const navBtn: React.CSSProperties = {
  width: '32px', height: '32px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  border: '1px solid #e5e7eb', background: 'white', borderRadius: '8px', cursor: 'pointer',
  color: '#374151', fontSize: '16px',
}
