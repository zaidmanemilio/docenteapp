'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Session, Commission, Profile, SessionType, SessionStatus, SessionModality, AdditionalLink } from '@/types'
import { SESSION_TYPE_LABELS, SESSION_STATUS_LABELS } from '@/types'

const TYPE_BADGE: Record<string, { bg: string; color: string }> = {
  teorica:      { bg: '#dbeafe', color: '#1d4ed8' },
  practica:     { bg: '#ccfbf1', color: '#0d9488' },
  taller:       { bg: '#fef3c7', color: '#d97706' },
  invitado:     { bg: '#fce7f3', color: '#be185d' },
  parcial:      { bg: '#fee2e2', color: '#dc2626' },
  recuperatorio:{ bg: '#ffedd5', color: '#c2410c' },
  exposicion:   { bg: '#ede9fe', color: '#7c3aed' },
  proyecto:     { bg: '#d1fae5', color: '#059669' },
}
const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  dada:         { bg: '#d1fae5', color: '#059669' },
  pendiente:    { bg: '#f3f4f6', color: '#6b7280' },
  reprogramada: { bg: '#fef3c7', color: '#d97706' },
  cancelada:    { bg: '#fee2e2', color: '#dc2626' },
}

function Badge({ text, style }: { text: string; style?: { bg: string; color: string } }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: '99px',
      fontSize: '11px', fontWeight: 500,
      background: style?.bg || '#f3f4f6',
      color: style?.color || '#6b7280',
    }}>{text}</span>
  )
}

function fmtDate(d: string) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function getSessionUrl(s: Session, field: string): string {
  switch (field) {
    case 'canva_url': return s.canva_url || ''
    case 'partial_file_url': return s.partial_file_url || ''
    case 'guest_bio_url': return s.guest_bio_url || ''
    case 'workshop_brief_url': return s.workshop_brief_url || ''
    default: return ''
  }
}

const LINK_FIELDS = ['canva_url', 'partial_file_url', 'guest_bio_url', 'workshop_brief_url']
const LINK_ICONS: Record<string, string> = {
  canva_url: 'ti-presentation',
  partial_file_url: 'ti-file-text',
  guest_bio_url: 'ti-user-circle',
  workshop_brief_url: 'ti-clipboard-list',
}

const EMPTY_SESSION: Omit<Session, 'id' | 'created_at' | 'updated_at'> = {
  course_id: '',
  class_number: undefined,
  date: '',
  title: '',
  type: 'teorica',
  responsible: '',
  modality: 'presencial',
  status: 'pendiente',
  commission_scope: 'all',
  canva_url: '',
  partial_file_url: '',
  additional_links: [],
  guest_bio_url: '',
  workshop_brief_url: '',
  shared_notes: '',
  private_notes: '',
}

export default function SchedulePage() {
  const { courseId } = useParams<{ courseId: string }>()
  const supabase = createClient()

  const [sessions, setSessions] = useState<Session[]>([])
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [courseName, setCourseName] = useState('')
  const [loading, setLoading] = useState(true)

  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterType, setFilterType] = useState<string>('all')
  const [filterCom, setFilterCom] = useState<string>('all')
  const [filterResp, setFilterResp] = useState<string>('all')
  const [filterModal, setFilterModal] = useState<string>('all')

  const [editSession, setEditSession] = useState<Session | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [addLinks, setAddLinks] = useState<AdditionalLink[]>([])
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [profileRes, courseRes, sessionsRes, commissionsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('courses').select('name').eq('id', courseId).single(),
      supabase.from('sessions').select('*').eq('course_id', courseId).order('date').order('class_number'),
      supabase.from('commissions').select('*').eq('course_id', courseId),
    ])
    setProfile(profileRes.data)
    setCourseName(courseRes.data?.name || '')
    setSessions(sessionsRes.data || [])
    setCommissions(commissionsRes.data || [])
    setLoading(false)
  }, [courseId])

  useEffect(() => { load() }, [load])

  const canEdit = profile?.global_role === 'admin' || profile?.global_role === 'teacher'

  const filtered = sessions.filter(s => {
    if (filterStatus !== 'all' && s.status !== filterStatus) return false
    if (filterType !== 'all' && s.type !== filterType) return false
    if (filterCom !== 'all') {
      if (filterCom === '__all__' && s.commission_scope !== 'all') return false
      if (filterCom !== '__all__' && s.commission_scope !== 'all' && s.commission_scope !== filterCom) return false
    }
    if (filterResp !== 'all' && s.responsible !== filterResp) return false
    if (filterModal !== 'all' && s.modality !== filterModal) return false
    return true
  })

  const responsables = [...new Set(sessions.map(s => s.responsible))].filter(Boolean)

  function openAdd() {
    const newS = {
      ...EMPTY_SESSION,
      course_id: courseId,
      commission_scope: commissions.length === 1 ? commissions[0].id : 'all',
    } as Session
    setEditSession(newS)
    setAddLinks([])
    setIsNew(true)
  }

  function openEdit(s: Session) {
    setEditSession({ ...s })
    setAddLinks([...(s.additional_links || [])])
    setIsNew(false)
  }

  async function save() {
    if (!editSession) return
    if (!editSession.title || !editSession.date) { alert('Título y fecha son obligatorios.'); return }
    setSaving(true)
    const { id, created_at, updated_at, ...payload } = editSession as Session & { created_at: string; updated_at: string }
    const finalPayload = { ...payload, additional_links: addLinks, course_id: courseId }
    if (isNew) {
      await supabase.from('sessions').insert(finalPayload)
    } else {
      await supabase.from('sessions').update({ ...finalPayload, updated_at: new Date().toISOString() }).eq('id', id)
    }
    setSaving(false)
    setEditSession(null)
    load()
  }

  async function deleteSession() {
    if (!editSession?.id) return
    if (!confirm('¿Eliminar este encuentro?')) return
    await supabase.from('sessions').delete().eq('id', editSession.id)
    setEditSession(null)
    load()
  }

  const showPartial = editSession?.type === 'parcial' || editSession?.type === 'recuperatorio'
  const showBio = editSession?.type === 'invitado'
  const showBrief = editSession?.type === 'taller'

  if (loading) return <div style={{ padding: '24px', color: '#6b7280' }}>Cargando...</div>

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.8.0/tabler-icons.min.css" />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '2px' }}>{courseName}</p>
          <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Cronograma</h2>
        </div>
        {canEdit && (
          <button onClick={openAdd} style={{ padding: '8px 16px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <i className="ti ti-plus" aria-hidden="true"></i> Agregar clase
          </button>
        )}
      </div>

      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Estado</span>
          {[['all','Todas'],['pendiente','Pendiente'],['dada','Dada'],['reprogramada','Reprog.'],['cancelada','Cancelada']].map(([v, l]) => (
            <button key={v} className={`filter-pill${filterStatus===v?' active':''}`} onClick={() => setFilterStatus(v)}>{l}</button>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tipo</span>
          {[['all','Todos'],['teorica','Teórica'],['practica','Práctica'],['taller','Taller'],['invitado','Invitado'],['parcial','Parcial'],['recuperatorio','Recuperatorio'],['exposicion','Exposición'],['proyecto','Proyecto']].map(([v, l]) => (
            <button key={v} className={`filter-pill${filterType===v?' active':''}`} onClick={() => setFilterType(v)}>{l}</button>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
          {commissions.length > 1 && <>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Comisión</span>
            <button className={`filter-pill${filterCom==='all'?' active':''}`} onClick={() => setFilterCom('all')}>Todas</button>
            {commissions.map(c => <button key={c.id} className={`filter-pill${filterCom===c.id?' active':''}`} onClick={() => setFilterCom(c.id)}>{c.name}</button>)}
            <button className={`filter-pill${filterCom==='__all__'?' active':''}`} onClick={() => setFilterCom('__all__')}>Comunes</button>
            <span style={{ width: '8px' }}></span>
          </>}
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Modalidad</span>
          {[['all','Todas'],['presencial','Presencial'],['virtual','Virtual']].map(([v, l]) => (
            <button key={v} className={`filter-pill${filterModal===v?' active':''}`} onClick={() => setFilterModal(v)}>{l}</button>
          ))}
          {responsables.length > 0 && <>
            <span style={{ width: '8px' }}></span>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Responsable</span>
            <select value={filterResp} onChange={e => setFilterResp(e.target.value)} style={{ padding: '4px 8px', borderRadius: '99px', fontSize: '12px', border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer' }}>
              <option value="all">Todos</option>
              {responsables.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </>}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#6b7280' }}>
          <i className="ti ti-calendar-off" style={{ fontSize: '40px', opacity: 0.4, display: 'block', marginBottom: '12px' }} aria-hidden="true"></i>
          <p>No hay encuentros con los filtros seleccionados.</p>
        </div>
      ) : (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['#','Fecha','Clase','Tipo','Responsable','Modalidad',...(commissions.length>1?['Comisión']:[]),'Estado','Links',''].map((h, i) => (
                  <th key={i} style={{ textAlign: 'left', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const com = commissions.find(c => c.id === s.commission_scope)
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px 12px', fontSize: '12px', color: '#6b7280', fontFamily: 'monospace' }}>{s.class_number}</td>
                    <td style={{ padding: '10px 12px', fontSize: '12px', color: '#6b7280', whiteSpace: 'nowrap' }}>{fmtDate(s.date)}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 500 }}>{s.title}</div>
                      {s.shared_notes && <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>📝 Tiene notas</div>}
                    </td>
                    <td style={{ padding: '10px 12px' }}><Badge text={SESSION_TYPE_LABELS[s.type] || s.type} style={TYPE_BADGE[s.type]} /></td>
                    <td style={{ padding: '10px 12px', fontSize: '12px' }}>{s.responsible}</td>
                    <td style={{ padding: '10px 12px' }}><Badge text={s.modality === 'presencial' ? '🏫 Pres.' : '💻 Virt.'} /></td>
                    {commissions.length > 1 && (
                      <td style={{ padding: '10px 12px' }}>
                        {s.commission_scope === 'all'
                          ? <Badge text="Todas" style={{ bg: '#e0e7ff', color: '#4338ca' }} />
                          : <Badge text={com?.name || s.commission_scope} style={{ bg: '#f0fdf4', color: '#166534' }} />
                        }
                      </td>
                    )}
                    <td style={{ padding: '10px 12px' }}><Badge text={SESSION_STATUS_LABELS[s.status] || s.status} style={STATUS_BADGE[s.status]} /></td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {LINK_FIELDS.map(field => {
                          if (field === 'partial_file_url' && !['parcial','recuperatorio'].includes(s.type)) return null
                          if (field === 'guest_bio_url' && s.type !== 'invitado') return null
                          if (field === 'workshop_brief_url' && s.type !== 'taller') return null
                          const url = getSessionUrl(s, field)
                          return url ? (
                            <a key={field} href={url} target="_blank" rel="noopener noreferrer" style={{ width: '24px', height: '24px', borderRadius: '4px', background: '#eef2ff', border: '1px solid #c7d2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1', fontSize: '13px' }}>
                              <i className={`ti ${LINK_ICONS[field]}`} aria-hidden="true"></i>
                            </a>
                          ) : (
                            <span key={field} style={{ width: '24px', height: '24px', borderRadius: '4px', background: '#f3f4f6', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d1d5db', fontSize: '13px' }}>
                              <i className={`ti ${LINK_ICONS[field]}`} aria-hidden="true"></i>
                            </span>
                          )
                        })}
                        {(s.additional_links?.length || 0) > 0 && (
                          <span style={{ width: '24px', height: '24px', borderRadius: '4px', background: '#eef2ff', border: '1px solid #c7d2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1', fontSize: '13px' }}>
                            <i className="ti ti-link" aria-hidden="true"></i>
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <button onClick={() => openEdit(s)} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>
                        <i className="ti ti-pencil" aria-hidden="true"></i>
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editSession && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'white', borderRadius: '12px', width: '640px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, flex: 1 }}>{isNew ? 'Nueva clase' : 'Editar clase'}</h3>
              <button onClick={() => setEditSession(null)} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer' }}>
                <i className="ti ti-x" aria-hidden="true"></i>
              </button>
            </div>
            <div style={{ padding: '20px 22px' }}>
              <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280', marginBottom: '12px', paddingBottom: '6px', borderBottom: '1px solid #e5e7eb' }}>Información básica</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px' }}>Nº de clase</label>
                  <input type="number" value={editSession.class_number || ''} onChange={e => setEditSession({...editSession, class_number: parseInt(e.target.value)})} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px' }}>Fecha *</label>
                  <input type="date" value={editSession.date} onChange={e => setEditSession({...editSession, date: e.target.value})} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }} />
                </div>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px' }}>Título *</label>
                <input value={editSession.title} onChange={e => setEditSession({...editSession, title: e.target.value})} placeholder="Ej: Introducción al pensamiento sistémico" style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px' }}>Tipo</label>
                  <select value={editSession.type} onChange={e => setEditSession({...editSession, type: e.target.value as SessionType})} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }}>
                    {Object.entries(SESSION_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px' }}>Estado</label>
                  <select value={editSession.status} onChange={e => setEditSession({...editSession, status: e.target.value as SessionStatus})} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }}>
                    {Object.entries(SESSION_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px' }}>Responsable</label>
                  <input value={editSession.responsible} onChange={e => setEditSession({...editSession, responsible: e.target.value})} placeholder="Nombre del docente" style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px' }}>Modalidad</label>
                  <select value={editSession.modality} onChange={e => setEditSession({...editSession, modality: e.target.value as SessionModality})} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }}>
                    <option value="presencial">Presencial</option>
                    <option value="virtual">Virtual</option>
                  </select>
                </div>
              </div>
              {commissions.length > 1 && (
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px' }}>Comisión</label>
                  <select value={editSession.commission_scope} onChange={e => setEditSession({...editSession, commission_scope: e.target.value})} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }}>
                    <option value="all">Todas las comisiones</option>
                    {commissions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280', margin: '20px 0 12px', paddingBottom: '6px', borderBottom: '1px solid #e5e7eb' }}>Links y recursos</p>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px' }}>Canva / Presentación</label>
                <input value={editSession.canva_url || ''} onChange={e => setEditSession({...editSession, canva_url: e.target.value})} placeholder="https://canva.com/..." style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }} />
              </div>
              {showPartial && (
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px' }}>Archivo del parcial</label>
                  <input value={editSession.partial_file_url || ''} onChange={e => setEditSession({...editSession, partial_file_url: e.target.value})} placeholder="https://drive.google.com/..." style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }} />
                </div>
              )}
              {showBio && (
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px' }}>Bio del invitado</label>
                  <input value={editSession.guest_bio_url || ''} onChange={e => setEditSession({...editSession, guest_bio_url: e.target.value})} placeholder="https://linkedin.com/..." style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }} />
                </div>
              )}
              {showBrief && (
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px' }}>Brief / Consigna</label>
                  <input value={editSession.workshop_brief_url || ''} onChange={e => setEditSession({...editSession, workshop_brief_url: e.target.value})} placeholder="https://drive.google.com/..." style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }} />
                </div>
              )}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>Links adicionales</label>
                {addLinks.map((l, i) => (
                  <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <input value={l.label} onChange={e => { const n=[...addLinks]; n[i]={...n[i],label:e.target.value}; setAddLinks(n) }} placeholder="Etiqueta" style={{ width: '120px', padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '12px', fontFamily: 'inherit' }} />
                    <input value={l.url} onChange={e => { const n=[...addLinks]; n[i]={...n[i],url:e.target.value}; setAddLinks(n) }} placeholder="URL" style={{ flex: 1, padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '12px', fontFamily: 'inherit' }} />
                    <button onClick={() => setAddLinks(addLinks.filter((_,j)=>j!==i))} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: '#6b7280' }}>
                      <i className="ti ti-trash" aria-hidden="true"></i>
                    </button>
                  </div>
                ))}
                <button onClick={() => setAddLinks([...addLinks, {label:'',url:''}])} style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: '12px', cursor: 'pointer', padding: '4px 0', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'inherit' }}>
                  <i className="ti ti-plus" aria-hidden="true"></i> Agregar link
                </button>
              </div>
              <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280', margin: '20px 0 12px', paddingBottom: '6px', borderBottom: '1px solid #e5e7eb' }}>Notas</p>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px' }}>Notas compartidas</label>
                <textarea value={editSession.shared_notes || ''} onChange={e => setEditSession({...editSession, shared_notes: e.target.value})} placeholder="Visibles para todo el equipo..." rows={3} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px' }}>Notas privadas</label>
                <textarea value={editSession.private_notes || ''} onChange={e => setEditSession({...editSession, private_notes: e.target.value})} placeholder="Solo vos las verás..." rows={2} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', opacity: 0.7 }} />
              </div>
              {!isNew && profile?.global_role === 'admin' && (
                <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #fee2e2' }}>
                  <button onClick={deleteSession} style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="ti ti-trash" aria-hidden="true"></i> Eliminar encuentro
                  </button>
                </div>
              )}
            </div>
            <div style={{ padding: '14px 22px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setEditSession(null)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', color: '#6b7280' }}>Cancelar</button>
              {canEdit && (
                <button onClick={save} disabled={saving} style={{ padding: '8px 16px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1, fontFamily: 'inherit' }}>
                  {saving ? 'Guardando...' : isNew ? 'Crear clase' : 'Guardar cambios'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
