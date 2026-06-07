'use client'
// src/app/(app)/courses/[courseId]/schedule/page.tsx

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
  course_id: '', class_number: undefined, date: '', title: '',
  type: 'teorica', responsible: '', modality: 'presencial', status: 'pendiente',
  commission_scope: 'all', canva_url: '', partial_file_url: '', additional_links: [],
  guest_bio_url: '', workshop_brief_url: '', shared_notes: '', private_notes: '',
}

type ExtendedSession = Session & {
  review_what_worked?: string; review_what_didnt?: string
  review_change_next?: string; review_add_next?: string
  review_time_estimated?: string; review_time_real?: string
  review_next_year?: string; start_time?: string; end_time?: string; location?: string
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb',
  borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 600,
  color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px',
}

export default function SchedulePage() {
  const { courseId } = useParams<{ courseId: string }>()
  const supabase = createClient()

  const [sessions, setSessions] = useState<ExtendedSession[]>([])
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [courseName, setCourseName] = useState('')
  const [zoomUrl, setZoomUrl] = useState('')
  const [loading, setLoading] = useState(true)

  // Filters (dynamic)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [filterCom, setFilterCom] = useState('all')
  const [filterResp, setFilterResp] = useState('all')
  const [filterModal, setFilterModal] = useState('all')

  // Edit modal
  const [editSession, setEditSession] = useState<ExtendedSession | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [addLinks, setAddLinks] = useState<AdditionalLink[]>([])
  const [saving, setSaving] = useState(false)
  const [modalTab, setModalTab] = useState<'basic' | 'links' | 'notes' | 'review' | 'schedule'>('basic')

  // Bulk edit
  const [bulkMode, setBulkMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkSaving, setBulkSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [profileRes, courseRes, sessionsRes, commissionsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('courses').select('name, zoom_url').eq('id', courseId).single(),
      supabase.from('sessions').select('*').eq('course_id', courseId).order('date').order('class_number'),
      supabase.from('commissions').select('*').eq('course_id', courseId),
    ])
    setProfile(profileRes.data)
    setCourseName(courseRes.data?.name || '')
    setZoomUrl(courseRes.data?.zoom_url || '')
    setSessions(sessionsRes.data || [])
    setCommissions(commissionsRes.data || [])
    setLoading(false)
  }, [courseId])

  useEffect(() => { load() }, [load])

  const canEdit = profile?.global_role === 'admin' || profile?.global_role === 'teacher'
  const isAdmin = profile?.global_role === 'admin'

  // Dynamic filter values
  const existingTypes = [...new Set(sessions.map(s => s.type))]
  const existingModalities = [...new Set(sessions.map(s => s.modality))]
  const responsables = [...new Set(sessions.map(s => s.responsible))].filter(Boolean)

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

  function openAdd() {
    const newS = {
      ...EMPTY_SESSION, course_id: courseId,
      commission_scope: commissions.length === 1 ? commissions[0].id : 'all',
    } as ExtendedSession
    setEditSession(newS)
    setAddLinks([])
    setIsNew(true)
    setModalTab('basic')
  }

  function openEdit(s: ExtendedSession) {
    setEditSession({ ...s })
    setAddLinks([...(s.additional_links || [])])
    setIsNew(false)
    setModalTab('basic')
  }

  async function save() {
    if (!editSession) return
    if (!editSession.title || !editSession.date) { alert('Título y fecha son obligatorios.'); return }
    setSaving(true)
    const { id, created_at, updated_at, ...payload } = editSession as ExtendedSession & { created_at: string; updated_at: string }
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

  // Bulk actions
  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function selectAll() { setSelected(new Set(filtered.map(s => s.id))) }
  function clearSelection() { setSelected(new Set()) }

  async function bulkChangeStatus(status: string) {
    if (!selected.size) return
    setBulkSaving(true)
    await supabase.from('sessions').update({ status }).in('id', [...selected])
    setBulkSaving(false)
    clearSelection()
    load()
  }

  async function bulkChangeModality(modality: string) {
    if (!selected.size) return
    setBulkSaving(true)
    await supabase.from('sessions').update({ modality }).in('id', [...selected])
    setBulkSaving(false)
    clearSelection()
    load()
  }

  async function bulkChangeResponsible() {
    const resp = prompt('Nuevo responsable para las clases seleccionadas:')
    if (!resp) return
    setBulkSaving(true)
    await supabase.from('sessions').update({ responsible: resp }).in('id', [...selected])
    setBulkSaving(false)
    clearSelection()
    load()
  }

  async function bulkDelete() {
    if (!selected.size) return
    if (!confirm(`¿Eliminar ${selected.size} encuentro${selected.size > 1 ? 's' : ''}? Esta acción no se puede deshacer.`)) return
    setBulkSaving(true)
    await supabase.from('sessions').delete().in('id', [...selected])
    setBulkSaving(false)
    setBulkMode(false)
    clearSelection()
    load()
  }

  const showPartial = editSession?.type === 'parcial' || editSession?.type === 'recuperatorio'
  const showBio = editSession?.type === 'invitado'
  const showBrief = editSession?.type === 'taller'

  if (loading) return <div style={{ padding: '24px', color: '#6b7280' }}>Cargando...</div>

  const tabStyle = (t: string): React.CSSProperties => ({
    padding: '7px 12px', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
    color: modalTab === t ? '#6366f1' : '#6b7280',
    borderBottom: modalTab === t ? '2px solid #6366f1' : '2px solid transparent',
    marginBottom: '-1px', background: 'none', border: 'none', fontFamily: 'inherit',
    borderBottomStyle: 'solid',
  })

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.8.0/tabler-icons.min.css" />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '2px' }}>{courseName}</p>
          <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Cronograma</h2>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {canEdit && (
            <button onClick={() => { setBulkMode(!bulkMode); clearSelection() }} style={{
              padding: '7px 14px', background: bulkMode ? '#eef2ff' : 'white',
              border: `1px solid ${bulkMode ? '#6366f1' : '#e5e7eb'}`,
              color: bulkMode ? '#4338ca' : '#6b7280',
              borderRadius: '8px', fontSize: '13px', fontWeight: bulkMode ? 600 : 400,
              cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              <i className="ti ti-list-check" aria-hidden="true"></i>
              {bulkMode ? 'Salir de edición masiva' : 'Edición masiva'}
            </button>
          )}
          {canEdit && (
            <button onClick={openAdd} style={{
              padding: '7px 16px', background: '#6366f1', color: 'white',
              border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              <i className="ti ti-plus" aria-hidden="true"></i> Agregar clase
            </button>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {bulkMode && (
        <div style={{
          background: '#1e1b4b', borderRadius: '10px', padding: '12px 16px',
          marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '13px', color: '#c7d2fe', fontWeight: 500 }}>
            {selected.size} seleccionada{selected.size !== 1 ? 's' : ''}
          </span>
          <button onClick={selectAll} style={{ fontSize: '12px', color: '#a5b4fc', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            Seleccionar todas
          </button>
          <button onClick={clearSelection} style={{ fontSize: '12px', color: '#a5b4fc', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            Limpiar
          </button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <select onChange={e => e.target.value && bulkChangeStatus(e.target.value)} defaultValue="" disabled={!selected.size || bulkSaving}
              style={{ padding: '5px 8px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', border: '1px solid #4338ca', background: '#312e81', color: '#c7d2fe', fontFamily: 'inherit' }}>
              <option value="">Cambiar estado...</option>
              <option value="pendiente">Pendiente</option>
              <option value="dada">Dada</option>
              <option value="reprogramada">Reprogramada</option>
              <option value="cancelada">Cancelada</option>
            </select>
            <select onChange={e => e.target.value && bulkChangeModality(e.target.value)} defaultValue="" disabled={!selected.size || bulkSaving}
              style={{ padding: '5px 8px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', border: '1px solid #4338ca', background: '#312e81', color: '#c7d2fe', fontFamily: 'inherit' }}>
              <option value="">Cambiar modalidad...</option>
              <option value="presencial">Presencial</option>
              <option value="virtual">Virtual</option>
            </select>
            <button onClick={bulkChangeResponsible} disabled={!selected.size || bulkSaving}
              style={{ padding: '5px 12px', borderRadius: '6px', fontSize: '12px', cursor: selected.size ? 'pointer' : 'default', border: '1px solid #4338ca', background: '#312e81', color: '#c7d2fe', fontFamily: 'inherit', opacity: selected.size ? 1 : 0.5 }}>
              Cambiar responsable
            </button>
            {isAdmin && (
              <button onClick={bulkDelete} disabled={!selected.size || bulkSaving}
                style={{ padding: '5px 12px', borderRadius: '6px', fontSize: '12px', cursor: selected.size ? 'pointer' : 'default', border: '1px solid #dc2626', background: '#450a0a', color: '#fca5a5', fontFamily: 'inherit', opacity: selected.size ? 1 : 0.5 }}>
                <i className="ti ti-trash" aria-hidden="true"></i> Eliminar
              </button>
            )}
          </div>
        </div>
      )}

      {/* Dynamic Filters */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Estado</span>
          {[['all','Todas'],['pendiente','Pendiente'],['dada','Dada'],['reprogramada','Reprog.'],['cancelada','Cancelada']].map(([v, l]) => (
            <button key={v} className={`filter-pill${filterStatus===v?' active':''}`} onClick={() => setFilterStatus(v)}>{l}</button>
          ))}
        </div>

        {/* Solo mostrar tipos que existen en este curso */}
        {existingTypes.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tipo</span>
            <button className={`filter-pill${filterType==='all'?' active':''}`} onClick={() => setFilterType('all')}>Todos</button>
            {existingTypes.map(t => (
              <button key={t} className={`filter-pill${filterType===t?' active':''}`} onClick={() => setFilterType(t)}>
                {SESSION_TYPE_LABELS[t as SessionType] || t}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
          {commissions.length > 1 && <>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Comisión</span>
            <button className={`filter-pill${filterCom==='all'?' active':''}`} onClick={() => setFilterCom('all')}>Todas</button>
            {commissions.map(c => <button key={c.id} className={`filter-pill${filterCom===c.id?' active':''}`} onClick={() => setFilterCom(c.id)}>{c.name}</button>)}
            <button className={`filter-pill${filterCom==='__all__'?' active':''}`} onClick={() => setFilterCom('__all__')}>Comunes</button>
            <span style={{ width: '8px' }}></span>
          </>}

          {/* Solo mostrar modalidades que existen */}
          {existingModalities.length > 1 && <>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Modalidad</span>
            <button className={`filter-pill${filterModal==='all'?' active':''}`} onClick={() => setFilterModal('all')}>Todas</button>
            {existingModalities.map(m => (
              <button key={m} className={`filter-pill${filterModal===m?' active':''}`} onClick={() => setFilterModal(m)}>
                {m === 'presencial' ? 'Presencial' : 'Virtual'}
              </button>
            ))}
            <span style={{ width: '8px' }}></span>
          </>}

          {responsables.length > 0 && <>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Responsable</span>
            <select value={filterResp} onChange={e => setFilterResp(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: '99px', fontSize: '12px', border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer' }}>
              <option value="all">Todos</option>
              {responsables.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </>}
        </div>
      </div>

      {/* Table */}
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
                {bulkMode && <th style={{ width: '36px', padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}></th>}
                {['#','Fecha','Clase','Tipo','Responsable','Modalidad',...(commissions.length>1?['Comisión']:[]),'Estado','Links',''].map((h, i) => (
                  <th key={i} style={{ textAlign: 'left', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const com = commissions.find(c => c.id === s.commission_scope)
                const hasReview = s.review_what_worked || s.review_what_didnt || s.review_change_next
                const showZoomLink = s.modality === 'virtual' && !s.canva_url && zoomUrl
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6', background: selected.has(s.id) ? '#eef2ff' : 'white' }}>
                    {bulkMode && (
                      <td style={{ padding: '10px 12px' }}>
                        <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSelect(s.id)}
                          style={{ width: '15px', height: '15px', cursor: 'pointer' }} />
                      </td>
                    )}
                    <td style={{ padding: '10px 12px', fontSize: '12px', color: '#6b7280', fontFamily: 'monospace' }}>{s.class_number}</td>
                    <td style={{ padding: '10px 12px', fontSize: '12px', color: '#6b7280', whiteSpace: 'nowrap' }}>{fmtDate(s.date)}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 500 }}>{s.title}</div>
                      <div style={{ display: 'flex', gap: '4px', marginTop: '3px', flexWrap: 'wrap' }}>
                        {s.shared_notes && <span style={{ fontSize: '10px', color: '#6b7280' }}>📝 notas</span>}
                        {hasReview && <span style={{ fontSize: '10px', color: '#059669' }}>✅ review</span>}
                        {s.status === 'dada' && !hasReview && <span style={{ fontSize: '10px', color: '#d97706' }}>⚠ sin review</span>}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px' }}><Badge text={SESSION_TYPE_LABELS[s.type] || s.type} style={TYPE_BADGE[s.type]} /></td>
                    <td style={{ padding: '10px 12px', fontSize: '12px' }}>{s.responsible}</td>
                    <td style={{ padding: '10px 12px' }}><Badge text={s.modality === 'presencial' ? '🏫 Pres.' : '💻 Virt.'} /></td>
                    {commissions.length > 1 && (
                      <td style={{ padding: '10px 12px' }}>
                        {s.commission_scope === 'all'
                          ? <Badge text="Todas" style={{ bg: '#e0e7ff', color: '#4338ca' }} />
                          : <Badge text={com?.name || s.commission_scope} style={{ bg: '#f0fdf4', color: '#166534' }} />}
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
                        {showZoomLink && (
                          <a href={zoomUrl} target="_blank" rel="noopener noreferrer" title="Zoom del curso" style={{ width: '24px', height: '24px', borderRadius: '4px', background: '#eef2ff', border: '1px solid #c7d2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1', fontSize: '13px' }}>
                            <i className="ti ti-video" aria-hidden="true"></i>
                          </a>
                        )}
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

      {/* Session Modal */}
      {editSession && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'white', borderRadius: '12px', width: '680px', maxWidth: '100%', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '16px 22px 0', borderBottom: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, flex: 1 }}>{isNew ? 'Nueva clase' : 'Editar clase'}</h3>
                {editSession.status === 'dada' && <span style={{ fontSize: '11px', padding: '2px 8px', background: '#d1fae5', color: '#059669', borderRadius: '99px', marginRight: '8px' }}>Clase dada</span>}
                <button onClick={() => setEditSession(null)} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer' }}>
                  <i className="ti ti-x" aria-hidden="true"></i>
                </button>
              </div>
              {/* Modal tabs */}
              <div style={{ display: 'flex', gap: '0' }}>
                <button style={tabStyle('basic')} onClick={() => setModalTab('basic')}>Básico</button>
                <button style={tabStyle('links')} onClick={() => setModalTab('links')}>Links</button>
                <button style={tabStyle('notes')} onClick={() => setModalTab('notes')}>Notas</button>
                <button style={tabStyle('review')} onClick={() => setModalTab('review')}>
                  Review post-clase {editSession.status === 'dada' && !editSession.review_what_worked && <span style={{ color: '#d97706' }}>⚠</span>}
                </button>
                <button style={tabStyle('schedule')} onClick={() => setModalTab('schedule')}>Horario</button>
              </div>
            </div>

            <div style={{ padding: '20px 22px' }}>

              {/* TAB: Básico */}
              {modalTab === 'basic' && <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={labelStyle}>Nº de clase</label>
                    <input type="number" value={editSession.class_number || ''} onChange={e => setEditSession({...editSession, class_number: parseInt(e.target.value)})} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Fecha *</label>
                    <input type="date" value={editSession.date} onChange={e => setEditSession({...editSession, date: e.target.value})} style={inputStyle} />
                  </div>
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={labelStyle}>Título *</label>
                  <input value={editSession.title} onChange={e => setEditSession({...editSession, title: e.target.value})} placeholder="Ej: Introducción al pensamiento sistémico" style={inputStyle} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={labelStyle}>Tipo</label>
                    <select value={editSession.type} onChange={e => setEditSession({...editSession, type: e.target.value as SessionType})} style={inputStyle}>
                      {Object.entries(SESSION_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Estado</label>
                    <select value={editSession.status} onChange={e => setEditSession({...editSession, status: e.target.value as SessionStatus})} style={inputStyle}>
                      {Object.entries(SESSION_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={labelStyle}>Responsable</label>
                    <input value={editSession.responsible} onChange={e => setEditSession({...editSession, responsible: e.target.value})} placeholder="Nombre del docente" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Modalidad</label>
                    <select value={editSession.modality} onChange={e => setEditSession({...editSession, modality: e.target.value as SessionModality})} style={inputStyle}>
                      <option value="presencial">Presencial</option>
                      <option value="virtual">Virtual</option>
                    </select>
                  </div>
                </div>
                {commissions.length > 1 && (
                  <div style={{ marginBottom: '12px' }}>
                    <label style={labelStyle}>Comisión</label>
                    <select value={editSession.commission_scope} onChange={e => setEditSession({...editSession, commission_scope: e.target.value})} style={inputStyle}>
                      <option value="all">Todas las comisiones</option>
                      {commissions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}
              </>}

              {/* TAB: Links */}
              {modalTab === 'links' && <>
                <div style={{ marginBottom: '12px' }}>
                  <label style={labelStyle}>Canva / Presentación</label>
                  <input value={editSession.canva_url || ''} onChange={e => setEditSession({...editSession, canva_url: e.target.value})} placeholder="https://canva.com/..." style={inputStyle} />
                </div>
                {showPartial && (
                  <div style={{ marginBottom: '12px' }}>
                    <label style={labelStyle}>Archivo del parcial</label>
                    <input value={editSession.partial_file_url || ''} onChange={e => setEditSession({...editSession, partial_file_url: e.target.value})} placeholder="https://drive.google.com/..." style={inputStyle} />
                  </div>
                )}
                {showBio && (
                  <div style={{ marginBottom: '12px' }}>
                    <label style={labelStyle}>Bio del invitado</label>
                    <input value={editSession.guest_bio_url || ''} onChange={e => setEditSession({...editSession, guest_bio_url: e.target.value})} placeholder="https://linkedin.com/..." style={inputStyle} />
                  </div>
                )}
                {showBrief && (
                  <div style={{ marginBottom: '12px' }}>
                    <label style={labelStyle}>Brief / Consigna del taller</label>
                    <input value={editSession.workshop_brief_url || ''} onChange={e => setEditSession({...editSession, workshop_brief_url: e.target.value})} placeholder="https://drive.google.com/..." style={inputStyle} />
                  </div>
                )}
                <div>
                  <label style={labelStyle}>Links adicionales</label>
                  {addLinks.map((l, i) => (
                    <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <input value={l.label} onChange={e => { const n=[...addLinks]; n[i]={...n[i],label:e.target.value}; setAddLinks(n) }} placeholder="Etiqueta" style={{ width: '110px', padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }} />
                      <input value={l.url} onChange={e => { const n=[...addLinks]; n[i]={...n[i],url:e.target.value}; setAddLinks(n) }} placeholder="URL" style={{ flex: 1, padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }} />
                      <button onClick={() => setAddLinks(addLinks.filter((_,j)=>j!==i))} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: '#6b7280' }}>
                        <i className="ti ti-trash" aria-hidden="true"></i>
                      </button>
                    </div>
                  ))}
                  <button onClick={() => setAddLinks([...addLinks, {label:'',url:''}])} style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: '12px', cursor: 'pointer', padding: '4px 0', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'inherit' }}>
                    <i className="ti ti-plus" aria-hidden="true"></i> Agregar link
                  </button>
                </div>
              </>}

              {/* TAB: Notas */}
              {modalTab === 'notes' && <>
                <div style={{ marginBottom: '16px' }}>
                  <label style={labelStyle}>Notas compartidas</label>
                  <p style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '6px' }}>Visibles para todo el equipo con acceso a este curso.</p>
                  <textarea value={editSession.shared_notes || ''} onChange={e => setEditSession({...editSession, shared_notes: e.target.value})} rows={4} placeholder="Notas del equipo docente..." style={{ ...inputStyle, resize: 'vertical', minHeight: '80px' }} />
                </div>
                <div>
                  <label style={{ ...labelStyle, color: '#9ca3af' }}>Notas privadas</label>
                  <p style={{ fontSize: '11px', color: '#d1d5db', marginBottom: '6px' }}>Solo vos las ves.</p>
                  <textarea value={editSession.private_notes || ''} onChange={e => setEditSession({...editSession, private_notes: e.target.value})} rows={3} placeholder="Solo vos las verás..." style={{ ...inputStyle, resize: 'vertical', opacity: 0.7 }} />
                </div>
              </>}

              {/* TAB: Review post-clase */}
              {modalTab === 'review' && <>
                {editSession.status !== 'dada' && (
                  <div style={{ padding: '10px 14px', background: '#fef3c7', borderRadius: '8px', fontSize: '12px', color: '#92400e', marginBottom: '16px' }}>
                    Esta sección es para revisar la clase después de haberla dado. Podés completarla cuando el estado sea "Dada".
                  </div>
                )}
                {[
                  { key: 'review_what_worked', label: '✅ ¿Qué funcionó bien?', placeholder: 'Dinámicas, tiempos, participación...' },
                  { key: 'review_what_didnt', label: '❌ ¿Qué no funcionó?', placeholder: 'Problemas técnicos, falta de tiempo...' },
                  { key: 'review_change_next', label: '🔄 ¿Qué cambiarías para la próxima edición?', placeholder: '' },
                  { key: 'review_add_next', label: '➕ ¿Qué agregarías?', placeholder: '' },
                  { key: 'review_next_year', label: '📌 Observaciones para el próximo año', placeholder: '' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key} style={{ marginBottom: '14px' }}>
                    <label style={labelStyle}>{label}</label>
                    <textarea
                      value={(editSession as Record<string, unknown>)[key] as string || ''}
                      onChange={e => setEditSession({ ...editSession, [key]: e.target.value })}
                      rows={2} placeholder={placeholder}
                      style={{ ...inputStyle, resize: 'vertical' }}
                    />
                  </div>
                ))}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={labelStyle}>⏱ Tiempo estimado de clase</label>
                    <input value={editSession.review_time_estimated || ''} onChange={e => setEditSession({...editSession, review_time_estimated: e.target.value})} placeholder="Ej: 90 min" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>⏱ Tiempo real demandado</label>
                    <input value={editSession.review_time_real || ''} onChange={e => setEditSession({...editSession, review_time_real: e.target.value})} placeholder="Ej: 110 min" style={inputStyle} />
                  </div>
                </div>
              </>}

              {/* TAB: Horario */}
              {modalTab === 'schedule' && <>
                <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
                  Horario y aula del encuentro. Se usa para la vista de Agenda y detección de superposiciones.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div>
                    <label style={labelStyle}>Hora de inicio</label>
                    <input type="time" value={editSession.start_time || ''} onChange={e => setEditSession({...editSession, start_time: e.target.value})} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Hora de fin</label>
                    <input type="time" value={editSession.end_time || ''} onChange={e => setEditSession({...editSession, end_time: e.target.value})} style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Aula / Sala / Lugar</label>
                  <input value={editSession.location || ''} onChange={e => setEditSession({...editSession, location: e.target.value})} placeholder="Ej: Aula 2 - Edificio A" style={inputStyle} />
                </div>
              </>}

              {/* Delete (admin only, not new) */}
              {!isNew && isAdmin && (
                <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #fee2e2' }}>
                  <button onClick={deleteSession} style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="ti ti-trash" aria-hidden="true"></i> Eliminar encuentro
                  </button>
                </div>
              )}
            </div>

            <div style={{ padding: '14px 22px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setEditSession(null)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', color: '#6b7280' }}>
                Cancelar
              </button>
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
