'use client'
// src/app/(app)/courses/[courseId]/schedule/page.tsx
// Fix: permisos granulares por curso, no solo por rol global

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Commission, Profile, AdditionalLink } from '@/types'
import { SESSION_TYPE_LABELS, SESSION_STATUS_LABELS } from '@/types'
import type { SessionType } from '@/types'
import SessionModal, { type ExtendedSession } from '@/components/schedule/SessionModal'

// ─── Tipos y constantes ───────────────────────────────────────────────────────

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

const LINK_FIELDS = ['canva_url', 'partial_file_url', 'guest_bio_url', 'workshop_brief_url']
const LINK_ICONS: Record<string, string> = {
  canva_url:         'ti-presentation',
  partial_file_url:  'ti-file-text',
  guest_bio_url:     'ti-user-circle',
  workshop_brief_url:'ti-clipboard-list',
}

const EMPTY_SESSION: Omit<ExtendedSession, 'id' | 'created_at' | 'updated_at'> = {
  course_id: '', class_number: undefined, date: '', title: '',
  type: 'teorica', responsible: '', modality: 'presencial', status: 'pendiente',
  commission_scope: 'all', canva_url: '', partial_file_url: '', additional_links: [],
  guest_bio_url: '', workshop_brief_url: '', shared_notes: '', private_notes: '',
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

function getSessionUrl(s: ExtendedSession, field: string): string {
  switch (field) {
    case 'canva_url':         return s.canva_url || ''
    case 'partial_file_url':  return s.partial_file_url || ''
    case 'guest_bio_url':     return s.guest_bio_url || ''
    case 'workshop_brief_url':return s.workshop_brief_url || ''
    default: return ''
  }
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const { courseId } = useParams<{ courseId: string }>()
  const supabase = createClient()

  const [sessions,     setSessions]     = useState<ExtendedSession[]>([])
  const [commissions,  setCommissions]  = useState<Commission[]>([])
  const [profile,      setProfile]      = useState<Profile | null>(null)
  const [courseName,   setCourseName]   = useState('')
  const [zoomUrl,      setZoomUrl]      = useState('')
  const [loading,      setLoading]      = useState(true)
  // Permiso efectivo del usuario en este curso
  const [coursePermission, setCoursePermission] = useState<string | null>(null)

  const [filterStatus, setFilterStatus] = useState('all')
  const [filterType,   setFilterType]   = useState('all')
  const [filterCom,    setFilterCom]    = useState('all')
  const [filterResp,   setFilterResp]   = useState('all')
  const [filterModal,  setFilterModal]  = useState('all')

  const [editSession,  setEditSession]  = useState<ExtendedSession | null>(null)
  const [isNew,        setIsNew]        = useState(false)
  const [addLinks,     setAddLinks]     = useState<AdditionalLink[]>([])
  const [saving,       setSaving]       = useState(false)

  const [bulkMode,     setBulkMode]     = useState(false)
  const [selected,     setSelected]     = useState<Set<string>>(new Set())
  const [bulkSaving,   setBulkSaving]   = useState(false)

  // ─── Fetch ───────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [profileRes, courseRes, sessionsRes, commissionsRes, permRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('courses').select('name, zoom_url').eq('id', courseId).single(),
      supabase.from('sessions').select('*').eq('course_id', courseId).order('date').order('class_number'),
      supabase.from('commissions').select('*').eq('course_id', courseId),
      // Obtener el permiso del usuario en este curso específico
      supabase.from('user_course_permissions')
        .select('permission')
        .eq('user_id', user.id)
        .eq('course_id', courseId)
        .order('permission') // full > edit > read alfabéticamente no funciona, manejamos abajo
    ])

    const p = profileRes.data
    setProfile(p)
    setCourseName(courseRes.data?.name || '')
    setZoomUrl(courseRes.data?.zoom_url || '')
    setSessions(sessionsRes.data || [])
    setCommissions(commissionsRes.data || [])

    // Determinar permiso efectivo:
    // Admin global → siempre 'full'
    // Otros → tomar el permiso más alto que tenga en este curso
    if (p?.global_role === 'admin') {
      setCoursePermission('full')
    } else {
      const perms = permRes.data || []
      const PERM_RANK: Record<string, number> = { full: 3, edit: 2, read: 1 }
      const best = perms.reduce((acc: string | null, row) => {
        if (!acc) return row.permission
        return (PERM_RANK[row.permission] || 0) > (PERM_RANK[acc] || 0) ? row.permission : acc
      }, null)
      setCoursePermission(best)
    }

    setLoading(false)
  }, [courseId])

  useEffect(() => { load() }, [load])

  // ─── Permisos efectivos ───────────────────────────────────────────────────
  // canEdit: puede editar encuentros (edit o full en este curso, o admin global)
  const canEdit = coursePermission === 'full' || coursePermission === 'edit'
  // canDelete: solo full o admin
  const isAdmin = profile?.global_role === 'admin'
  const canDelete = coursePermission === 'full' || isAdmin

  // ─── Filtros dinámicos ────────────────────────────────────────────────────
  const existingTypes      = [...new Set(sessions.map(s => s.type))]
  const existingModalities = [...new Set(sessions.map(s => s.modality))]
  const responsables       = [...new Set(sessions.map(s => s.responsible))].filter(Boolean)

  const filtered = sessions.filter(s => {
    if (filterStatus !== 'all' && s.status !== filterStatus) return false
    if (filterType   !== 'all' && s.type   !== filterType)   return false
    if (filterCom !== 'all') {
      if (filterCom === '__all__' && s.commission_scope !== 'all') return false
      if (filterCom !== '__all__' && s.commission_scope !== 'all' && s.commission_scope !== filterCom) return false
    }
    if (filterResp  !== 'all' && s.responsible !== filterResp)  return false
    if (filterModal !== 'all' && s.modality    !== filterModal)  return false
    return true
  })

  // ─── Handlers modal ───────────────────────────────────────────────────────
  function openAdd() {
    if (!canEdit) return
    setEditSession({
      ...EMPTY_SESSION,
      course_id: courseId,
      commission_scope: commissions.length === 1 ? commissions[0].id : 'all',
    } as ExtendedSession)
    setAddLinks([])
    setIsNew(true)
  }

  function openEdit(s: ExtendedSession) {
    setEditSession({ ...s })
    setAddLinks([...(s.additional_links || [])])
    setIsNew(false)
  }

  function handleClose() { setEditSession(null) }

  async function handleSave() {
    if (!editSession) return
    // Verificar permiso antes de guardar (no solo ocultar botón)
    if (!canEdit) {
      alert('No tenés permiso para editar encuentros en este curso.')
      return
    }
    if (!editSession.title || !editSession.date) {
      alert('Título y fecha son obligatorios.')
      return
    }
    setSaving(true)
    const { id, created_at, updated_at, ...payload } = editSession as ExtendedSession & { created_at: string; updated_at: string }
    const finalPayload = { ...payload, additional_links: addLinks, course_id: courseId }

    if (isNew) {
      await supabase.from('sessions').insert(finalPayload)
    } else {
      await supabase.from('sessions')
        .update({ ...finalPayload, updated_at: new Date().toISOString() })
        .eq('id', id)
    }
    setSaving(false)
    setEditSession(null)
    load()
  }

  async function handleDelete() {
    if (!editSession?.id) return
    // Verificar permiso de borrado
    if (!canDelete) {
      alert('No tenés permiso para eliminar encuentros en este curso.')
      return
    }
    if (!confirm('¿Eliminar este encuentro?')) return
    await supabase.from('sessions').delete().eq('id', editSession.id)
    setEditSession(null)
    load()
  }

  // ─── Handlers edición masiva ──────────────────────────────────────────────
  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function selectAll()     { setSelected(new Set(filtered.map(s => s.id as string))) }
  function clearSelection(){ setSelected(new Set()) }

  async function bulkChangeStatus(status: string) {
    if (!selected.size || !canEdit) return
    setBulkSaving(true)
    await supabase.from('sessions').update({ status }).in('id', [...selected])
    setBulkSaving(false)
    clearSelection()
    load()
  }

  async function bulkChangeModality(modality: string) {
    if (!selected.size || !canEdit) return
    setBulkSaving(true)
    await supabase.from('sessions').update({ modality }).in('id', [...selected])
    setBulkSaving(false)
    clearSelection()
    load()
  }

  async function bulkChangeResponsible() {
    if (!canEdit) return
    const resp = prompt('Nuevo responsable para las clases seleccionadas:')
    if (!resp) return
    setBulkSaving(true)
    await supabase.from('sessions').update({ responsible: resp }).in('id', [...selected])
    setBulkSaving(false)
    clearSelection()
    load()
  }

  async function bulkDelete() {
    if (!selected.size || !canDelete) return
    if (!confirm(`¿Eliminar ${selected.size} encuentro${selected.size > 1 ? 's' : ''}? Esta acción no se puede deshacer.`)) return
    setBulkSaving(true)
    await supabase.from('sessions').delete().in('id', [...selected])
    setBulkSaving(false)
    setBulkMode(false)
    clearSelection()
    load()
  }

  if (loading) return <div style={{ padding: '24px', color: '#6b7280' }}>Cargando...</div>

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
              padding: '7px 14px',
              background: bulkMode ? '#eef2ff' : 'white',
              border: `1px solid ${bulkMode ? '#6366f1' : '#e5e7eb'}`,
              color: bulkMode ? '#4338ca' : '#6b7280',
              borderRadius: '8px', fontSize: '13px',
              fontWeight: bulkMode ? 600 : 400,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: '6px',
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

      {/* Barra edición masiva */}
      {bulkMode && (
        <div style={{
          background: '#1e1b4b', borderRadius: '10px', padding: '12px 16px',
          marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '13px', color: '#c7d2fe', fontWeight: 500 }}>
            {selected.size} seleccionada{selected.size !== 1 ? 's' : ''}
          </span>
          <button onClick={selectAll}      style={{ fontSize: '12px', color: '#a5b4fc', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Seleccionar todas</button>
          <button onClick={clearSelection} style={{ fontSize: '12px', color: '#a5b4fc', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Limpiar</button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <select onChange={e => e.target.value && bulkChangeStatus(e.target.value)} defaultValue=""
              disabled={!selected.size || bulkSaving}
              style={{ padding: '5px 8px', borderRadius: '6px', fontSize: '12px', border: '1px solid #4338ca', background: '#312e81', color: '#c7d2fe', fontFamily: 'inherit' }}>
              <option value="">Cambiar estado...</option>
              <option value="pendiente">Pendiente</option>
              <option value="dada">Dada</option>
              <option value="reprogramada">Reprogramada</option>
              <option value="cancelada">Cancelada</option>
            </select>
            <select onChange={e => e.target.value && bulkChangeModality(e.target.value)} defaultValue=""
              disabled={!selected.size || bulkSaving}
              style={{ padding: '5px 8px', borderRadius: '6px', fontSize: '12px', border: '1px solid #4338ca', background: '#312e81', color: '#c7d2fe', fontFamily: 'inherit' }}>
              <option value="">Cambiar modalidad...</option>
              <option value="presencial">Presencial</option>
              <option value="virtual">Virtual</option>
            </select>
            <button onClick={bulkChangeResponsible} disabled={!selected.size || bulkSaving}
              style={{ padding: '5px 12px', borderRadius: '6px', fontSize: '12px', border: '1px solid #4338ca', background: '#312e81', color: '#c7d2fe', fontFamily: 'inherit', opacity: selected.size ? 1 : 0.5, cursor: selected.size ? 'pointer' : 'default' }}>
              Cambiar responsable
            </button>
            {canDelete && (
              <button onClick={bulkDelete} disabled={!selected.size || bulkSaving}
                style={{ padding: '5px 12px', borderRadius: '6px', fontSize: '12px', border: '1px solid #dc2626', background: '#450a0a', color: '#fca5a5', fontFamily: 'inherit', opacity: selected.size ? 1 : 0.5, cursor: selected.size ? 'pointer' : 'default' }}>
                <i className="ti ti-trash" aria-hidden="true"></i> Eliminar
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filtros dinámicos */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Estado</span>
          {[['all','Todas'],['pendiente','Pendiente'],['dada','Dada'],['reprogramada','Reprog.'],['cancelada','Cancelada']].map(([v, l]) => (
            <button key={v} className={`filter-pill${filterStatus===v?' active':''}`} onClick={() => setFilterStatus(v)}>{l}</button>
          ))}
        </div>

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
            {commissions.map(c => (
              <button key={c.id} className={`filter-pill${filterCom===c.id?' active':''}`} onClick={() => setFilterCom(c.id)}>{c.name}</button>
            ))}
            <button className={`filter-pill${filterCom==='__all__'?' active':''}`} onClick={() => setFilterCom('__all__')}>Comunes</button>
            <span style={{ width: '8px' }}></span>
          </>}
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

      {/* Tabla */}
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
                {['#','Fecha','Clase','Tipo','Responsable','Modalidad',...(commissions.length>1?['Comisión']:[]),'Estado','Links','Ver'].map((h, i) => (
                  <th key={i} style={{ textAlign: 'left', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const com = commissions.find(c => c.id === s.commission_scope)
                const hasReview  = s.review_what_worked || s.review_what_didnt || s.review_change_next
                const showZoomLink = s.modality === 'virtual' && !s.canva_url && zoomUrl

                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6', background: selected.has(s.id as string) ? '#eef2ff' : 'white' }}>
                    {bulkMode && (
                      <td style={{ padding: '10px 12px' }}>
                        <input type="checkbox" checked={selected.has(s.id as string)}
                          onChange={() => toggleSelect(s.id as string)}
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
                          if (field === 'partial_file_url'   && !['parcial','recuperatorio'].includes(s.type)) return null
                          if (field === 'guest_bio_url'      && s.type !== 'invitado') return null
                          if (field === 'workshop_brief_url' && s.type !== 'taller')   return null
                          const url = getSessionUrl(s, field)
                          return url ? (
<a key={field} href={url} target="_blank" rel="noopener noreferrer"
  title={
    field === 'canva_url' ? 'Canva / Presentación' :
    field === 'partial_file_url' ? 'Archivo del parcial' :
    field === 'guest_bio_url' ? 'Bio del invitado' :
    field === 'workshop_brief_url' ? 'Brief / Consigna' : field
  }
  style={{ width: '24px', height: '24px', borderRadius: '4px', background: '#eef2ff', border: '1px solid #c7d2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1', fontSize: '13px', textDecoration: 'none' }}>
  <i className={`ti ${LINK_ICONS[field]}`} aria-hidden="true"></i>
</a>                          ) : (
                            <span key={field} style={{ width: '24px', height: '24px', borderRadius: '4px', background: '#f3f4f6', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d1d5db', fontSize: '13px' }}>
                              <i className={`ti ${LINK_ICONS[field]}`} aria-hidden="true"></i>
                            </span>
                          )
                        })}
                        {showZoomLink && (
                          <a href={zoomUrl} target="_blank" rel="noopener noreferrer" title="Zoom del curso"
                            style={{ width: '24px', height: '24px', borderRadius: '4px', background: '#eef2ff', border: '1px solid #c7d2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1', fontSize: '13px' }}>
                            <i className="ti ti-video" aria-hidden="true"></i>
                          </a>
                        )}
{(s.additional_links || []).map((link, idx) => (
  <a key={idx} href={link.url} target="_blank" rel="noopener noreferrer"
    title={link.label || `Link ${idx + 1}`}
    style={{ width: '24px', height: '24px', borderRadius: '4px', background: '#eef2ff', border: '1px solid #c7d2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1', fontSize: '13px', textDecoration: 'none' }}>
    <i className="ti ti-link" aria-hidden="true"></i>
  </a>
))}                      </div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
<button onClick={() => openEdit(s)}
  title="Ver y editar clase"
  style={{ background: '#6366f1', border: 'none', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', color: 'white', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
  <i className="ti ti-player-play-filled" aria-hidden="true"></i>
</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {editSession && (
        <SessionModal
          session={editSession}
          isNew={isNew}
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
