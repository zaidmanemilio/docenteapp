// src/app/(app)/courses/[courseId]/dashboard/page.tsx
// Fix: empty state con CTA a Importar cronograma cuando no hay encuentros
'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import PageLoading from '@/components/layout/PageLoading'
import Link from 'next/link'
import { useCourseId } from '@/lib/use-course'
import { TYPE_COLORS } from '@/components/schedule/SessionCard'
import { SESSION_TYPE_LABELS } from '@/types'
import type { SessionType } from '@/types'
import { FOCOS_PENDIENTES, contar, urlFoco } from '@/lib/session-focus'

/* eslint-disable @typescript-eslint/no-explicit-any */
interface DashboardData { course: any; sessions: any[]; todos: any[] }

export default function DashboardPage() {
  const courseId = useCourseId()
  const [supabase] = useState(() => createClient())
  const [data, setData] = useState<DashboardData | null>(null)

  useEffect(() => {
    let cancelled = false
    setData(null)
    ;(async () => {
      const [courseRes, sessionsRes, todosRes] = await Promise.all([
        supabase.from('courses').select('*, subjects(name)').eq('id', courseId).single(),
        supabase.from('sessions').select('*').eq('course_id', courseId).order('date').order('class_number'),
        supabase.from('todos').select('*').eq('course_id', courseId),
      ])
      if (cancelled) return
      setData({
        course: courseRes.data,
        sessions: sessionsRes.data || [],
        todos: todosRes.data || [],
      })
    })()
    return () => { cancelled = true }
  }, [courseId, supabase])

  if (!data) return <PageLoading />

  // A partir de acá no hay hooks: es el mismo render que antes resolvía el
  // servidor, con los datos ya cargados.
  const { course, sessions, todos } = data
  const today = new Date().toISOString().slice(0, 10)

  if (!course) return <div style={{ padding:'24px', color:'var(--text-muted)' }}>Curso no encontrado.</div>

  // ── Empty state: curso sin encuentros ──────────────────────────────────────
  if (sessions.length === 0) {
    return (
      <div style={{ flex:1, overflow:'auto', padding:'24px' }}>
        <div className="page-head">
          <h1 className="page-title">Panel</h1>
          <p className="page-meta">{course.name} · {course.year} · sin encuentros cargados</p>
        </div>

        <div style={{
          maxWidth: '480px', margin: '48px auto', textAlign: 'center',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '40px 32px',
        }}>
          <div style={{ width:'64px', height:'64px', background:'var(--chip-accent-bg)', borderRadius:'16px', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px', fontSize:'28px' }}>
            📅
          </div>
          <h3 style={{ fontSize:'18px', fontWeight:700, marginBottom:'8px', color:'var(--text-primary)' }}>
            Este curso no tiene clases todavía
          </h3>
          <p style={{ fontSize:'13px', color:'var(--text-muted)', lineHeight:'1.6', marginBottom:'28px' }}>
            Para empezar, podés importar tu cronograma desde un archivo CSV o Excel, o agregar las clases manualmente una por una.
          </p>
          <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
            <Link href={`/courses/import?c=${courseId}`} style={{
              display:'flex', alignItems:'center', justifyContent:'center', gap:'8px',
              padding:'12px 20px', background:'var(--accent)', color:'white',
              borderRadius:'10px', textDecoration:'none', fontSize:'14px', fontWeight:600,
            }}>
              <i className="ti ti-upload" aria-hidden="true"></i>
              Importar cronograma desde CSV / Excel
            </Link>
            <Link href={`/courses/schedule?c=${courseId}`} style={{
              display:'flex', alignItems:'center', justifyContent:'center', gap:'8px',
              padding:'12px 20px', background:'var(--surface)', color:'var(--text-secondary)',
              border:'1px solid var(--border)', borderRadius:'10px', textDecoration:'none', fontSize:'14px',
            }}>
              <i className="ti ti-plus" aria-hidden="true"></i>
              Agregar clases manualmente
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Panel ──────────────────────────────────────────────────────────────
  //
  // Antes esto eran siete contadores y una lista de alertas que decía
  // "4 clases sin link a presentación" sin manera de ver cuáles: el número
  // era un callejón sin salida. Ahora todo lo que muestra un número lleva al
  // Cronograma mostrando exactamente esos encuentros (lib/session-focus).
  const total      = sessions.length
  const dadas      = sessions.filter(s => s.status === 'dada').length
  const pendientes = sessions.filter(s => s.status === 'pendiente').length
  const pct        = total ? Math.round((dadas / total) * 100) : 0
  const todosOpen  = todos.filter(t => t.status === 'open').length

  const presencial = sessions.filter(s => s.modality === 'presencial').length
  const virtual    = sessions.filter(s => s.modality === 'virtual').length

  const typeCounts: Record<string, number> = {}
  sessions.forEach(s => { typeCounts[s.type] = (typeCounts[s.type] || 0) + 1 })
  const maxType = Math.max(...Object.values(typeCounts), 1)

  // Cada pendiente se cuenta con la MISMA regla con la que después se filtra.
  const pendientesOperativos = FOCOS_PENDIENTES
    .map(f => ({ foco: f, cuantos: contar(f, sessions, today) }))
    .filter(x => x.cuantos > 0)

  return (
    <div style={{ flex:1, overflow:'auto', padding:'24px' }}>

      <div className="page-head">
        <h1 className="page-title">Panel</h1>
        <p className="page-meta">{course.name} · {course.year}</p>
      </div>

      {/* Tres números, los tres accionables. */}
      <div className="kpi-row">
        <Link className="kpi" href={urlFoco(courseId, 'dada')}>
          <span className="kpi-label">Encuentros dados</span>
          <span className="kpi-value tabular">
            {dadas}<span className="kpi-of">/{total}</span>
          </span>
          <span className="kpi-sub">{pct}% del curso · ver los dados</span>
        </Link>

        <Link className={`kpi${pendientes > 0 ? ' is-open' : ''}`} href={urlFoco(courseId, 'pendiente')}>
          <span className="kpi-label">Clases por dar</span>
          <span className="kpi-value tabular">{pendientes}</span>
          <span className="kpi-sub">ver el listado</span>
        </Link>

        <Link className={`kpi${todosOpen > 0 ? ' is-open' : ''}`} href={`/courses/todos?c=${courseId}`}>
          <span className="kpi-label">Tareas abiertas</span>
          <span className="kpi-value tabular">{todosOpen}</span>
          <span className="kpi-sub">ir a Tareas</span>
        </Link>
      </div>

      {/* Dos fichas chicas: avance y modalidad. */}
      <div className="mini-row">
        <div className="mini">
          <div className="mini-head">
            <span className="mini-title">Avance</span>
            <span className="tabular" style={{ fontSize:'var(--text-lg)', fontWeight:700, color:'var(--accent)' }}>{pct}%</span>
          </div>
          <div className="progress-bar"><div className="progress-fill" style={{ width:`${pct}%` }}></div></div>
          <p className="mini-foot">Faltan {pendientes} de {total}</p>
        </div>

        <div className="mini">
          <div className="mini-head"><span className="mini-title">Modalidad</span></div>
          {/* Clicables: la modalidad era un gráfico que no llevaba a ningún lado. */}
          <div style={{ display:'flex', gap:'var(--space-2)' }}>
            <Link className="mini-pill" href={urlFoco(courseId, 'presencial')}>
              <span className="tabular">{presencial}</span> presenciales
            </Link>
            <Link className="mini-pill" href={urlFoco(courseId, 'virtual')}>
              <span className="tabular">{virtual}</span> virtuales
            </Link>
          </div>
          {course.zoom_url && (
            <a href={course.zoom_url} target="_blank" rel="noopener noreferrer" className="mini-foot"
              style={{ display:'inline-flex', alignItems:'center', gap:'4px', marginTop:'var(--space-3)', color:'var(--accent)' }}>
              <i className="ti ti-video" aria-hidden="true"></i> Zoom del curso
            </a>
          )}
        </div>
      </div>

      {/* Para resolver: cada fila dice qué pasa, cuántos son, y lleva a verlos. */}
      <div className="card" style={{ marginBottom:'var(--space-4)' }}>
        <h2 className="card-title">Para resolver</h2>
        {pendientesOperativos.length === 0 ? (
          <div style={{ textAlign:'center', padding:'var(--space-8) 0', color:'var(--success)' }}>
            <i className="ti ti-circle-check" style={{ fontSize:'28px' }} aria-hidden="true"></i>
            <p style={{ marginTop:'var(--space-2)', fontWeight:600 }}>No queda nada pendiente.</p>
          </div>
        ) : (
          <div className="todo-list">
            {pendientesOperativos.map(({ foco, cuantos }) => (
              <Link key={foco.key} className={`todo-row tono-${foco.tono}`} href={urlFoco(courseId, foco.key)}>
                <i className={`ti ${foco.icono}`} aria-hidden="true"></i>
                <span className="todo-text">
                  <span className="todo-title">{foco.titulo}</span>
                  <span className="todo-help">{foco.ayuda}</span>
                </span>
                <span className="todo-count tabular">{cuantos}</span>
                <i className="ti ti-chevron-right" aria-hidden="true"></i>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Por tipo, también clicable. */}
      <div className="card">
        <h2 className="card-title">Encuentros por tipo</h2>
        <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-2)' }}>
          {Object.entries(typeCounts).map(([type, count]) => (
            <Link key={type} href={urlFoco(courseId, `tipo:${type}`)} className="type-row">
              <span className="type-name">{SESSION_TYPE_LABELS[type as SessionType] || type}</span>
              <span className="type-track">
                <span className="type-bar" style={{ width:`${Math.round(count/maxType*100)}%`, background:TYPE_COLORS[type]||'var(--accent-solid)' }}></span>
              </span>
              <span className="type-count tabular">{count}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
