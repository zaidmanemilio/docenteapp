// src/app/(app)/courses/[courseId]/dashboard/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Session, Todo } from '@/types'

function KpiCard({ label, value, sub, variant = 'default' }: {
  label: string; value: string | number; sub?: string; variant?: 'accent'|'success'|'warning'|'danger'|'default'
}) {
  const borders: Record<string, string> = {
    accent: '#6366f1', success: '#6ee7b7', warning: '#fcd34d', danger: '#fca5a5', default: '#e5e7eb'
  }
  const colors: Record<string, string> = {
    accent: '#6366f1', success: '#059669', warning: '#d97706', danger: '#dc2626', default: '#111827'
  }
  return (
    <div style={{ background: 'white', border: `1px solid ${borders[variant]}`, borderRadius: '12px', padding: '14px 16px' }}>
      <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '26px', fontWeight: 600, color: colors[variant], lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>{sub}</div>}
    </div>
  )
}

function AlertRow({ text, icon }: { text: string; icon: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '8px', background: '#fef3c7', color: '#92400e', fontSize: '12px', marginBottom: '8px' }}>
      <i className={`ti ${icon}`} style={{ fontSize: '15px', flexShrink: 0 }} aria-hidden="true"></i>
      <span>{text}</span>
    </div>
  )
}

export default async function DashboardPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [courseRes, sessionsRes, todosRes] = await Promise.all([
    supabase.from('courses').select('*, subjects(name)').eq('id', courseId).single(),
    supabase.from('sessions').select('*').eq('course_id', courseId).order('date').order('class_number'),
    supabase.from('todos').select('*').eq('course_id', courseId),
  ])

  const course = courseRes.data
  const sessions: Session[] = sessionsRes.data || []
  const todos: Todo[] = todosRes.data || []

  if (!course) return <div style={{ padding: '24px', color: '#6b7280' }}>Curso no encontrado.</div>

  const total = sessions.length
  const dadas = sessions.filter(s => s.status === 'dada').length
  const pendientes = sessions.filter(s => s.status === 'pendiente').length
  const reprog = sessions.filter(s => s.status === 'reprogramada').length
  const canceladas = sessions.filter(s => s.status === 'cancelada').length
  const pct = total ? Math.round((dadas / total) * 100) : 0

  const sinCanva = sessions.filter(s => !s.canva_url && !['parcial','recuperatorio','exposicion','proyecto'].includes(s.type)).length
  const sinBrief = sessions.filter(s => s.type === 'taller' && !s.workshop_brief_url).length
  const sinParcial = sessions.filter(s => ['parcial','recuperatorio'].includes(s.type) && !s.partial_file_url).length
  const sinBio = sessions.filter(s => s.type === 'invitado' && !s.guest_bio_url).length
  const todosOpen = todos.filter(t => t.status === 'open').length

  const typeCounts: Record<string, number> = {}
  sessions.forEach(s => { typeCounts[s.type] = (typeCounts[s.type] || 0) + 1 })
  const typeLabels: Record<string, string> = { teorica:'Teórica', practica:'Práctica', taller:'Taller', invitado:'Invitado', parcial:'Parcial', recuperatorio:'Recuperatorio', exposicion:'Exposición', proyecto:'Proyecto' }
  const typeColors: Record<string, string> = { teorica:'#6366f1', practica:'#0d9488', taller:'#d97706', invitado:'#be185d', parcial:'#dc2626', recuperatorio:'#f97316', exposicion:'#7c3aed', proyecto:'#059669' }
  const maxType = Math.max(...Object.values(typeCounts), 1)

  const presencial = sessions.filter(s => s.modality === 'presencial').length
  const virtual = sessions.filter(s => s.modality === 'virtual').length

  const alerts = []
  if (sinCanva > 0) alerts.push({ text: `${sinCanva} clase${sinCanva>1?'s':''} sin link a presentación/Canva`, icon: 'ti-brand-figma' })
  if (sinBrief > 0) alerts.push({ text: `${sinBrief} taller${sinBrief>1?'es':''} sin brief/consigna`, icon: 'ti-file-description' })
  if (sinParcial > 0) alerts.push({ text: `${sinParcial} parcial/recuperatorio sin archivo cargado`, icon: 'ti-file-alert' })
  if (sinBio > 0) alerts.push({ text: `${sinBio} invitado${sinBio>1?'s':''} sin bio cargada`, icon: 'ti-user-question' })
  if (todosOpen > 0) alerts.push({ text: `${todosOpen} pendiente${todosOpen>1?'s':''} abierto${todosOpen>1?'s':''}`, icon: 'ti-clock-exclamation' })

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.8.0/tabler-icons.min.css" />

      {/* Topbar */}
      <div style={{ marginBottom: '20px' }}>
        <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '2px' }}>{course.name}</p>
        <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Dashboard</h2>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <KpiCard label="Total encuentros" value={total} sub={`de ${course.expected_sessions} esperados`} variant="accent" />
        <KpiCard label="Clases dadas" value={dadas} sub={`${pct}% del curso`} variant="success" />
        <KpiCard label="Pendientes" value={pendientes} sub="por dar" />
        {reprog > 0 && <KpiCard label="Reprogramadas" value={reprog} variant="warning" />}
        {canceladas > 0 && <KpiCard label="Canceladas" value={canceladas} variant="danger" />}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        {/* Avance */}
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px 20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px' }}>Avance del semestre</h3>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '32px', fontWeight: 600, color: '#6366f1' }}>{pct}%</span>
            <span style={{ fontSize: '12px', color: '#6b7280' }}>{dadas} de {total} clases</span>
          </div>
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }}></div></div>
          <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '8px' }}>Faltan {pendientes} encuentros por dar</p>
        </div>

        {/* Modalidad */}
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px 20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px' }}>Modalidad</h3>
          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: '28px', fontWeight: 600, color: '#6366f1' }}>{presencial}</div>
              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>Presencial</div>
              <div className="progress-bar" style={{ marginTop: '6px' }}><div className="progress-fill" style={{ width: total ? `${Math.round(presencial/total*100)}%` : '0%' }}></div></div>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: '28px', fontWeight: 600, color: '#0d9488' }}>{virtual}</div>
              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>Virtual</div>
              <div className="progress-bar" style={{ marginTop: '6px' }}><div className="progress-fill" style={{ width: total ? `${Math.round(virtual/total*100)}%` : '0%', background: '#0d9488' }}></div></div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Por tipo */}
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px 20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>Encuentros por tipo</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {Object.entries(typeCounts).map(([type, count]) => (
              <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '12px', color: '#6b7280', width: '90px', textAlign: 'right', flexShrink: 0 }}>{typeLabels[type] || type}</span>
                <div style={{ flex: 1, height: '20px', background: '#f3f4f6', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.round(count/maxType*100)}%`,
                    height: '100%',
                    background: typeColors[type] || '#6366f1',
                    borderRadius: '4px',
                    display: 'flex', alignItems: 'center', paddingLeft: '8px'
                  }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'white' }}>{count}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Alertas */}
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px 20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>Alertas operativas</h3>
          {alerts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#059669' }}>
              <i className="ti ti-circle-check" style={{ fontSize: '28px' }} aria-hidden="true"></i>
              <p style={{ marginTop: '8px', fontWeight: 500 }}>¡Todo en orden!</p>
            </div>
          ) : alerts.map((a, i) => <AlertRow key={i} text={a.text} icon={a.icon} />)}
        </div>
      </div>
    </div>
  )
}
