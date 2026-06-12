'use client'
// src/components/calendar/CalendarViews.tsx
// Piezas de UI compartidas entre el Calendario unificado y la Agenda de curso.
// No conoce Supabase ni permisos: recibe datos ya cargados y callbacks.
//
// Exporta:
//   - CalendarView: tipo 'list' | 'week' | 'month'
//   - ViewSwitch: el conmutador de vistas (Lista / Semana / Mes)
//   - MonthNav: navegación de mes (‹ Mes Año › + Hoy)
//   - MonthGrid: grilla mensual genérica
//   - filterWeek / weekRangeLabel: helpers para la vista Semana (lista de la semana)


export type CalendarView = 'list' | 'week' | 'month'

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const WEEKDAYS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']

/* ------------------------------------------------------------------ */
/* Helpers de fecha (sin dependencias de zona horaria)                */
/* ------------------------------------------------------------------ */

// 'YYYY-MM' -> 'Junio 2026'
export function fmtMonthLabel(year: number, month0: number) {
  return `${MONTHS[month0]} ${year}`
}

// Lunes=0 ... Domingo=6 para una fecha 'YYYY-MM-DD'
function mondayFirstIndex(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const js = new Date(y, m - 1, d).getDay() // 0=Dom ... 6=Sáb
  return (js + 6) % 7
}

// Devuelve semanas (cada celda 'YYYY-MM-DD' o null) para un mes dado.
export function buildMonthGrid(year: number, month0: number): (string | null)[][] {
  const mm = String(month0 + 1).padStart(2, '0')
  const lead = mondayFirstIndex(`${year}-${mm}-01`)
  const daysInMonth = new Date(year, month0 + 1, 0).getDate()

  const cells: (string | null)[] = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${year}-${mm}-${String(d).padStart(2, '0')}`)
  while (cells.length % 7 !== 0) cells.push(null)

  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

// Lunes y domingo (YYYY-MM-DD) de la semana que contiene `ref` (Date).
export function weekBounds(ref: Date): { start: string; end: string } {
  const day = (ref.getDay() + 6) % 7 // 0=lunes
  const monday = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - day)
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { start: iso(monday), end: iso(sunday) }
}

// Filtra una lista de items con `.date` a la semana de `ref`.
export function filterWeek<T extends { date: string }>(items: T[], ref: Date): T[] {
  const { start, end } = weekBounds(ref)
  return items.filter(i => i.date >= start && i.date <= end)
}

// Etiqueta "9 – 15 jun" para la semana de `ref`.
export function weekRangeLabel(ref: Date): string {
  const { start, end } = weekBounds(ref)
  const sm = MONTHS[parseInt(start.slice(5, 7)) - 1].slice(0, 3).toLowerCase()
  const em = MONTHS[parseInt(end.slice(5, 7)) - 1].slice(0, 3).toLowerCase()
  const sd = parseInt(start.slice(8, 10))
  const ed = parseInt(end.slice(8, 10))
  if (sm === em) return `${sd} – ${ed} ${sm}`
  return `${sd} ${sm} – ${ed} ${em}`
}

/* ------------------------------------------------------------------ */
/* ViewSwitch — conmutador Lista / Semana / Mes                       */
/* ------------------------------------------------------------------ */

const VIEW_LABELS: Record<CalendarView, { label: string; icon: string }> = {
  list:  { label: 'Lista',  icon: 'ti-list' },
  week:  { label: 'Semana', icon: 'ti-calendar-week' },
  month: { label: 'Mes',    icon: 'ti-calendar-month' },
}

export function ViewSwitch({ value, onChange }: { value: CalendarView; onChange: (v: CalendarView) => void }) {
  return (
    <div style={{ display: 'inline-flex', background: 'var(--hover-bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '2px', gap: '2px' }}>
      {(Object.keys(VIEW_LABELS) as CalendarView[]).map(v => {
        const active = value === v
        return (
          <button
            key={v}
            onClick={() => onChange(v)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit', border: 'none',
              background: active ? 'var(--surface)' : 'transparent',
              color: active ? 'var(--accent)' : 'var(--text-muted)',
              boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.12s',
            }}
          >
            <i className={`ti ${VIEW_LABELS[v].icon}`} style={{ fontSize: '14px' }} aria-hidden="true"></i>
            {VIEW_LABELS[v].label}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* MonthNav — ‹  Mes Año  ›   [Hoy]                                   */
/* ------------------------------------------------------------------ */

export function MonthNav({
  label, onPrev, onNext, onToday,
}: { label: string; onPrev: () => void; onNext: () => void; onToday: () => void }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      <button onClick={onPrev} aria-label="Anterior" className="nav-btn"><i className="ti ti-chevron-left" aria-hidden="true"></i></button>
      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', minWidth: '150px', textAlign: 'center' }}>{label}</div>
      <button onClick={onNext} aria-label="Siguiente" className="nav-btn"><i className="ti ti-chevron-right" aria-hidden="true"></i></button>
      <button onClick={onToday} className="filter-pill" style={{ marginLeft: '4px' }}>Hoy</button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* MonthGrid — grilla mensual genérica                                */
/* ------------------------------------------------------------------ */

export interface MonthEvent {
  id: string
  date: string
  title: string
  color: string          // color de la barra (por tipo o por curso)
  time?: string          // 'HH:MM' opcional, se muestra antes del título
  muted?: boolean        // tachado/atenuado (p. ej. cancelada)
  flagPast?: boolean     // punto rojo (pendiente vencida)
}

export function MonthGrid({
  year, month0, events, today, onEventClick,
}: {
  year: number
  month0: number
  events: MonthEvent[]
  today: string
  onEventClick: (id: string) => void
}) {
  const weeks = buildMonthGrid(year, month0)

  const byDate: Record<string, MonthEvent[]> = {}
  events.forEach(e => {
    if (!e.date) return
    ;(byDate[e.date] ||= []).push(e)
  })

  return (
    <div>
      {/* Encabezado de días */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', marginBottom: '6px' }}>
        {WEEKDAYS.map(d => (
          <div key={d} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'center', padding: '4px 0' }}>{d}</div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
            {week.map((dateStr, di) => {
              if (!dateStr) return <div key={di} style={{ minHeight: '94px', background: 'var(--hover-bg)', borderRadius: '8px' }} />
              const dayNum  = parseInt(dateStr.slice(8, 10))
              const isToday = dateStr === today
              const dayEv   = byDate[dateStr] || []
              return (
                <div key={di} style={{
                  minHeight: '94px', background: 'var(--surface)',
                  border: `1px solid ${isToday ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: '8px', padding: '6px',
                  display: 'flex', flexDirection: 'column', gap: '4px',
                }}>
                  <div style={{ fontSize: '12px', fontWeight: isToday ? 700 : 600, color: isToday ? 'var(--accent)' : 'var(--text-secondary)', textAlign: 'right', lineHeight: 1 }}>{dayNum}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', overflow: 'hidden' }}>
                    {dayEv.map(e => (
                      <button
                        key={e.id}
                        onClick={() => onEventClick(e.id)}
                        title={`${e.title}${e.time ? ' · ' + e.time : ''}`}
                        style={{
                          textAlign: 'left', border: 'none', borderLeft: `3px solid ${e.color}`,
                          background: e.color + '14',
                          color: e.muted ? 'var(--text-muted)' : 'var(--text-primary)',
                          textDecoration: e.muted ? 'line-through' : 'none',
                          borderRadius: '4px', padding: '3px 5px', fontSize: '11px', lineHeight: 1.2,
                          cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          opacity: e.muted ? 0.7 : 1,
                        }}
                      >
                        {e.time && <span style={{ color: 'var(--text-muted)', marginRight: '4px' }}>{e.time.slice(0, 5)}</span>}
                        {e.flagPast && <span style={{ color: 'var(--danger)', marginRight: '3px' }}>●</span>}
                        {e.title}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
