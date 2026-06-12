// src/app/(app)/courses/[courseId]/dashboard/page.tsx
// Fix: empty state con CTA a Importar cronograma cuando no hay encuentros
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

function KpiCard({ label, value, sub, variant = 'default' }: {
  label: string; value: string | number; sub?: string
  variant?: 'accent'|'success'|'warning'|'danger'|'default'
}) {
  const borders: Record<string, string> = { accent:'var(--accent)', success:'#6ee7b7', warning:'#fcd34d', danger:'#fca5a5', default:'var(--border)' }
  const colors:  Record<string, string> = { accent:'var(--accent)', success:'var(--success)', warning:'var(--warning)', danger:'var(--danger)', default:'var(--text-primary)' }
  return (
    <div style={{ background:'var(--surface)', border:`1px solid ${borders[variant]}`, borderRadius:'12px', padding:'14px 16px' }}>
      <div style={{ fontSize:'11px', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'6px' }}>{label}</div>
      <div style={{ fontSize:'26px', fontWeight:600, color:colors[variant], lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:'11px', color:'var(--text-muted)', marginTop:'4px' }}>{sub}</div>}
    </div>
  )
}

function AlertRow({ text, icon, color = '#92400e', bg = '#fef3c7' }: { text: string; icon: string; color?: string; bg?: string }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'8px 12px', borderRadius:'8px', background:bg, color, fontSize:'12px', marginBottom:'8px' }}>
      <i className={`ti ${icon}`} style={{ fontSize:'15px', flexShrink:0 }} aria-hidden="true"></i>
      <span>{text}</span>
    </div>
  )
}

export default async function DashboardPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const today = new Date().toISOString().slice(0, 10)

  const [courseRes, sessionsRes, todosRes] = await Promise.all([
    supabase.from('courses').select('*, subjects(name)').eq('id', courseId).single(),
    supabase.from('sessions').select('*').eq('course_id', courseId).order('date').order('class_number'),
    supabase.from('todos').select('*').eq('course_id', courseId),
  ])

  const course   = courseRes.data
  const sessions = sessionsRes.data || []
  const todos    = todosRes.data    || []

  if (!course) return <div style={{ padding:'24px', color:'var(--text-muted)' }}>Curso no encontrado.</div>

  // ── Empty state: curso sin encuentros ──────────────────────────────────────
  if (sessions.length === 0) {
    return (
      <div style={{ flex:1, overflow:'auto', padding:'24px' }}>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.8.0/tabler-icons.min.css" />
        <div style={{ marginBottom:'20px' }}>
          <p style={{ fontSize:'12px', color:'var(--text-muted)', marginBottom:'2px' }}>{course.name}</p>
          <h2 style={{ fontSize:'20px', fontWeight:600 }}>Dashboard</h2>
        </div>

        <div style={{
          maxWidth: '480px', margin: '48px auto', textAlign: 'center',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '40px 32px',
        }}>
          <div style={{ width:'64px', height:'64px', background:'#eef2ff', borderRadius:'16px', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px', fontSize:'28px' }}>
            📅
          </div>
          <h3 style={{ fontSize:'18px', fontWeight:700, marginBottom:'8px', color:'var(--text-primary)' }}>
            Este curso no tiene clases todavía
          </h3>
          <p style={{ fontSize:'13px', color:'var(--text-muted)', lineHeight:'1.6', marginBottom:'28px' }}>
            Para empezar, podés importar tu cronograma desde un archivo CSV o Excel, o agregar las clases manualmente una por una.
          </p>
          <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
            <Link href={`/courses/${courseId}/import`} style={{
              display:'flex', alignItems:'center', justifyContent:'center', gap:'8px',
              padding:'12px 20px', background:'var(--accent)', color:'white',
              borderRadius:'10px', textDecoration:'none', fontSize:'14px', fontWeight:600,
            }}>
              <i className="ti ti-upload" aria-hidden="true"></i>
              Importar cronograma desde CSV / Excel
            </Link>
            <Link href={`/courses/${courseId}/schedule`} style={{
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

  // ── Dashboard normal ───────────────────────────────────────────────────────
  const total     = sessions.length
  const dadas     = sessions.filter(s => s.status === 'dada').length
  const pendientes= sessions.filter(s => s.status === 'pendiente').length
  const reprog    = sessions.filter(s => s.status === 'reprogramada').length
  const canceladas= sessions.filter(s => s.status === 'cancelada').length
  const pct       = total ? Math.round((dadas / total) * 100) : 0

  const sinCanva  = sessions.filter(s => !s.canva_url && !['parcial','recuperatorio','exposicion','proyecto'].includes(s.type) && s.status !== 'cancelada').length
  const sinBrief  = sessions.filter(s => s.type === 'taller'      && !s.workshop_brief_url && s.status !== 'cancelada').length
  const sinParcial= sessions.filter(s => ['parcial','recuperatorio'].includes(s.type) && !s.partial_file_url && s.status !== 'cancelada').length
  const sinBio    = sessions.filter(s => s.type === 'invitado'    && !s.guest_bio_url    && s.status !== 'cancelada').length
  const sinResp   = sessions.filter(s => !s.responsible           && s.status !== 'cancelada').length
  const todosOpen = todos.filter(t => t.status === 'open').length
  const dadasSinReview    = sessions.filter(s => s.status === 'dada' && !s.review_what_worked && !s.review_what_didnt && !s.review_change_next).length
  const fechaPasadaPend   = sessions.filter(s => s.status === 'pendiente' && s.date < today).length
  const virtualSinZoom    = course.zoom_url ? 0 : sessions.filter(s => s.modality === 'virtual' && !s.canva_url && s.status !== 'cancelada').length

  const typeCounts: Record<string, number> = {}
  sessions.forEach(s => { typeCounts[s.type] = (typeCounts[s.type] || 0) + 1 })
  const typeLabels: Record<string,string> = { teorica:'Teórica', practica:'Práctica', taller:'Taller', invitado:'Invitado', parcial:'Parcial', recuperatorio:'Recuperatorio', exposicion:'Exposición', proyecto:'Proyecto' }
  const typeColors: Record<string,string> = { teorica:'#6366f1', practica:'#0d9488', taller:'#d97706', invitado:'#be185d', parcial:'#dc2626', recuperatorio:'#f97316', exposicion:'#7c3aed', proyecto:'#059669' }
  const maxType = Math.max(...Object.values(typeCounts), 1)

  const presencial = sessions.filter(s => s.modality === 'presencial').length
  const virtual    = sessions.filter(s => s.modality === 'virtual').length

  const alerts = [
    dadasSinReview   > 0 && { text:`${dadasSinReview} clase${dadasSinReview>1?'s':''} dada${dadasSinReview>1?'s':''} sin review post-clase`, icon:'ti-notes-off',         color:'#92400e', bg:'#fef3c7' },
    fechaPasadaPend  > 0 && { text:`${fechaPasadaPend} clase${fechaPasadaPend>1?'s':''} con fecha pasada y estado Pendiente`, icon:'ti-calendar-x',     color:'#991b1b', bg:'#fee2e2' },
    sinCanva         > 0 && { text:`${sinCanva} clase${sinCanva>1?'s':''} sin link a presentación/Canva`, icon:'ti-brand-figma',       color:'#92400e', bg:'#fef3c7' },
    sinBrief         > 0 && { text:`${sinBrief} taller${sinBrief>1?'es':''} sin brief/consigna`, icon:'ti-file-description',  color:'#92400e', bg:'#fef3c7' },
    sinParcial       > 0 && { text:`${sinParcial} parcial/recuperatorio sin archivo cargado`, icon:'ti-file-alert',         color:'#92400e', bg:'#fef3c7' },
    sinBio           > 0 && { text:`${sinBio} invitado${sinBio>1?'s':''} sin bio cargada`, icon:'ti-user-question',      color:'#92400e', bg:'#fef3c7' },
    sinResp          > 0 && { text:`${sinResp} encuentro${sinResp>1?'s':''} sin responsable asignado`, icon:'ti-user-x',            color:'#92400e', bg:'#fef3c7' },
    virtualSinZoom   > 0 && { text:`${virtualSinZoom} clase${virtualSinZoom>1?'s':''} virtual sin link de Zoom`, icon:'ti-video-off',        color:'#1d4ed8', bg:'#dbeafe' },
    todosOpen        > 0 && { text:`${todosOpen} tarea${todosOpen>1?'s':''} pendiente${todosOpen>1?'s':''} abierta${todosOpen>1?'s':''}`, icon:'ti-clock-exclamation', color:'#92400e', bg:'#fef3c7' },
  ].filter(Boolean) as { text: string; icon: string; color: string; bg: string }[]

  return (
    <div style={{ flex:1, overflow:'auto', padding:'24px' }}>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.8.0/tabler-icons.min.css" />

      <div style={{ marginBottom:'20px' }}>
        <p style={{ fontSize:'12px', color:'var(--text-muted)', marginBottom:'2px' }}>{course.name}</p>
        <h2 style={{ fontSize:'20px', fontWeight:600 }}>Dashboard</h2>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(130px, 1fr))', gap:'12px', marginBottom:'20px' }}>
        <KpiCard label="Total encuentros"  value={total}     sub={`de ${course.expected_sessions} esperados`} variant="accent"  />
        <KpiCard label="Clases dadas"      value={dadas}     sub={`${pct}% del curso`}                        variant="success" />
        <KpiCard label="Pendientes"        value={pendientes} sub="por dar" />
        {reprog    > 0 && <KpiCard label="Reprogramadas"   value={reprog}    variant="warning" />}
        {canceladas> 0 && <KpiCard label="Canceladas"      value={canceladas} variant="danger"  />}
        <KpiCard label="Tareas abiertas"   value={todosOpen}  variant={todosOpen > 0 ? 'warning' : 'default'} />
        <KpiCard label="Sin review"        value={dadasSinReview} sub="clases dadas" variant={dadasSinReview > 0 ? 'warning' : 'default'} />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginBottom:'16px' }}>
        {/* Avance */}
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'12px', padding:'16px 20px' }}>
          <h3 style={{ fontSize:'15px', fontWeight:600, marginBottom:'12px' }}>Avance del semestre</h3>
          <div style={{ display:'flex', alignItems:'baseline', gap:'8px', marginBottom:'8px' }}>
            <span style={{ fontSize:'32px', fontWeight:600, color:'var(--accent)' }}>{pct}%</span>
            <span style={{ fontSize:'12px', color:'var(--text-muted)' }}>{dadas} de {total} clases</span>
          </div>
          <div className="progress-bar"><div className="progress-fill" style={{ width:`${pct}%` }}></div></div>
          <p style={{ fontSize:'11px', color:'var(--text-muted)', marginTop:'8px' }}>Faltan {pendientes} encuentros por dar</p>
          {fechaPasadaPend > 0 && (
            <p style={{ fontSize:'11px', color:'var(--danger)', marginTop:'4px', display:'flex', alignItems:'center', gap:'4px' }}>
              <i className="ti ti-alert-circle" aria-hidden="true"></i> {fechaPasadaPend} con fecha pasada
            </p>
          )}
        </div>

        {/* Modalidad */}
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'12px', padding:'16px 20px' }}>
          <h3 style={{ fontSize:'15px', fontWeight:600, marginBottom:'12px' }}>Modalidad</h3>
          <div style={{ display:'flex', gap:'16px' }}>
            <div style={{ flex:1, textAlign:'center' }}>
              <div style={{ fontSize:'28px', fontWeight:600, color:'var(--accent)' }}>{presencial}</div>
              <div style={{ fontSize:'11px', color:'var(--text-muted)', marginTop:'2px' }}>Presencial</div>
              <div className="progress-bar" style={{ marginTop:'6px' }}>
                <div className="progress-fill" style={{ width: total ? `${Math.round(presencial/total*100)}%`:'0%' }}></div>
              </div>
            </div>
            <div style={{ flex:1, textAlign:'center' }}>
              <div style={{ fontSize:'28px', fontWeight:600, color:'#0d9488' }}>{virtual}</div>
              <div style={{ fontSize:'11px', color:'var(--text-muted)', marginTop:'2px' }}>Virtual</div>
              <div className="progress-bar" style={{ marginTop:'6px' }}>
                <div className="progress-fill" style={{ width: total ? `${Math.round(virtual/total*100)}%`:'0%', background:'#0d9488' }}></div>
              </div>
            </div>
          </div>
          {course.zoom_url && (
            <a href={course.zoom_url} target="_blank" rel="noopener noreferrer" style={{ display:'flex', alignItems:'center', gap:'6px', marginTop:'12px', padding:'6px 10px', background:'#eef2ff', border:'1px solid #c7d2fe', borderRadius:'6px', color:'#4338ca', fontSize:'12px', textDecoration:'none' }}>
              <i className="ti ti-video" aria-hidden="true"></i> Zoom del curso
            </a>
          )}
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px' }}>
        {/* Por tipo */}
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'12px', padding:'16px 20px' }}>
          <h3 style={{ fontSize:'15px', fontWeight:600, marginBottom:'14px' }}>Encuentros por tipo</h3>
          <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
            {Object.entries(typeCounts).map(([type, count]) => (
              <div key={type} style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                <span style={{ fontSize:'12px', color:'var(--text-muted)', width:'90px', textAlign:'right', flexShrink:0 }}>{typeLabels[type]||type}</span>
                <div style={{ flex:1, height:'20px', background:'#f3f4f6', borderRadius:'4px', overflow:'hidden' }}>
                  <div style={{ width:`${Math.round(count/maxType*100)}%`, height:'100%', background:typeColors[type]||'#6366f1', borderRadius:'4px', display:'flex', alignItems:'center', paddingLeft:'8px' }}>
                    <span style={{ fontSize:'11px', fontWeight:600, color:'white' }}>{count}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Alertas */}
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'12px', padding:'16px 20px' }}>
          <h3 style={{ fontSize:'15px', fontWeight:600, marginBottom:'14px' }}>Alertas operativas</h3>
          {alerts.length === 0 ? (
            <div style={{ textAlign:'center', padding:'24px 0', color:'var(--success)' }}>
              <i className="ti ti-circle-check" style={{ fontSize:'28px' }} aria-hidden="true"></i>
              <p style={{ marginTop:'8px', fontWeight:500 }}>¡Todo en orden!</p>
            </div>
          ) : (
            <div style={{ maxHeight:'280px', overflowY:'auto' }}>
              {alerts.map((a, i) => <AlertRow key={i} text={a.text} icon={a.icon} color={a.color} bg={a.bg} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
