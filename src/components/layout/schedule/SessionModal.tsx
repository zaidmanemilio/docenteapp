'use client'
// src/components/schedule/SessionModal.tsx
// Extraído de schedule/page.tsx — sin cambios de comportamiento ni diseño.

import { useState } from 'react'
import type { Commission, AdditionalLink } from '@/types'
import { SESSION_TYPE_LABELS, SESSION_STATUS_LABELS } from '@/types'
import type { SessionType, SessionStatus, SessionModality } from '@/types'

// Tipo extendido con campos de review y horario (v2)
export interface ExtendedSession {
  id?: string
  course_id: string
  class_number?: number
  date: string
  title: string
  type: SessionType
  responsible: string
  modality: SessionModality
  status: SessionStatus
  commission_scope: string
  canva_url?: string
  partial_file_url?: string
  additional_links: AdditionalLink[]
  guest_bio_url?: string
  workshop_brief_url?: string
  shared_notes?: string
  private_notes?: string
  // Campos v2
  review_what_worked?: string
  review_what_didnt?: string
  review_change_next?: string
  review_add_next?: string
  review_time_estimated?: string
  review_time_real?: string
  review_next_year?: string
  start_time?: string
  end_time?: string
  location?: string
  // Campos de Supabase
  created_at?: string
  updated_at?: string
}

export interface SessionModalProps {
  session: ExtendedSession
  isNew: boolean
  commissions: Commission[]
  addLinks: AdditionalLink[]
  canEdit: boolean
  isAdmin: boolean
  saving: boolean
  onClose: () => void
  onSave: () => void
  onDelete: () => void
  onSessionChange: (s: ExtendedSession) => void
  onAddLinksChange: (links: AdditionalLink[]) => void
}

// ─── Estilos locales (idénticos a los de schedule/page.tsx) ──────────────────
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  fontSize: '13px',
  fontFamily: 'inherit',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 600,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  marginBottom: '5px',
}

type ModalTab = 'basic' | 'links' | 'notes' | 'review' | 'schedule'

// ─── Componente ──────────────────────────────────────────────────────────────
export default function SessionModal({
  session,
  isNew,
  commissions,
  addLinks,
  canEdit,
  isAdmin,
  saving,
  onClose,
  onSave,
  onDelete,
  onSessionChange,
  onAddLinksChange,
}: SessionModalProps) {
  const [modalTab, setModalTab] = useState<ModalTab>('basic')

  const showPartial = session.type === 'parcial' || session.type === 'recuperatorio'
  const showBio = session.type === 'invitado'
  const showBrief = session.type === 'taller'

  const hasReview = session.review_what_worked || session.review_what_didnt || session.review_change_next

  function tabStyle(t: ModalTab): React.CSSProperties {
    return {
      padding: '7px 12px',
      fontSize: '12px',
      fontWeight: 500,
      cursor: 'pointer',
      color: modalTab === t ? '#6366f1' : '#6b7280',
      borderBottom: modalTab === t ? '2px solid #6366f1' : '2px solid transparent',
      marginBottom: '-1px',
      background: 'none',
      border: 'none',
      fontFamily: 'inherit',
      borderBottomStyle: 'solid' as const,
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '20px',
      }}
    >
      <div
        style={{
          background: 'white', borderRadius: '12px',
          width: '680px', maxWidth: '100%',
          maxHeight: '92vh', overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        {/* ── Header + tabs ── */}
        <div style={{ padding: '16px 22px 0', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, flex: 1 }}>
              {isNew ? 'Nueva clase' : 'Editar clase'}
            </h3>
            {session.status === 'dada' && (
              <span style={{
                fontSize: '11px', padding: '2px 8px',
                background: '#d1fae5', color: '#059669',
                borderRadius: '99px', marginRight: '8px',
              }}>
                Clase dada
              </span>
            )}
            <button
              onClick={onClose}
              style={{
                background: 'none', border: '1px solid #e5e7eb',
                borderRadius: '6px', padding: '4px 8px', cursor: 'pointer',
              }}
            >
              <i className="ti ti-x" aria-hidden="true"></i>
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex' }}>
            <button style={tabStyle('basic')} onClick={() => setModalTab('basic')}>Básico</button>
            <button style={tabStyle('links')} onClick={() => setModalTab('links')}>Links</button>
            <button style={tabStyle('notes')} onClick={() => setModalTab('notes')}>Notas</button>
            <button style={tabStyle('review')} onClick={() => setModalTab('review')}>
              Review post-clase{' '}
              {session.status === 'dada' && !hasReview && (
                <span style={{ color: '#d97706' }}>⚠</span>
              )}
            </button>
            <button style={tabStyle('schedule')} onClick={() => setModalTab('schedule')}>Horario</button>
          </div>
        </div>

        {/* ── Cuerpo ── */}
        <div style={{ padding: '20px 22px' }}>

          {/* TAB: Básico */}
          {modalTab === 'basic' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={labelStyle}>Nº de clase</label>
                  <input
                    type="number"
                    value={session.class_number || ''}
                    onChange={e => onSessionChange({ ...session, class_number: parseInt(e.target.value) })}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Fecha *</label>
                  <input
                    type="date"
                    value={session.date}
                    onChange={e => onSessionChange({ ...session, date: e.target.value })}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={labelStyle}>Título *</label>
                <input
                  value={session.title}
                  onChange={e => onSessionChange({ ...session, title: e.target.value })}
                  placeholder="Ej: Introducción al pensamiento sistémico"
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={labelStyle}>Tipo</label>
                  <select
                    value={session.type}
                    onChange={e => onSessionChange({ ...session, type: e.target.value as SessionType })}
                    style={inputStyle}
                  >
                    {Object.entries(SESSION_TYPE_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Estado</label>
                  <select
                    value={session.status}
                    onChange={e => onSessionChange({ ...session, status: e.target.value as SessionStatus })}
                    style={inputStyle}
                  >
                    {Object.entries(SESSION_STATUS_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={labelStyle}>Responsable</label>
                  <input
                    value={session.responsible}
                    onChange={e => onSessionChange({ ...session, responsible: e.target.value })}
                    placeholder="Nombre del docente"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Modalidad</label>
                  <select
                    value={session.modality}
                    onChange={e => onSessionChange({ ...session, modality: e.target.value as SessionModality })}
                    style={inputStyle}
                  >
                    <option value="presencial">Presencial</option>
                    <option value="virtual">Virtual</option>
                  </select>
                </div>
              </div>

              {commissions.length > 1 && (
                <div style={{ marginBottom: '12px' }}>
                  <label style={labelStyle}>Comisión</label>
                  <select
                    value={session.commission_scope}
                    onChange={e => onSessionChange({ ...session, commission_scope: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="all">Todas las comisiones</option>
                    {commissions.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          {/* TAB: Links */}
          {modalTab === 'links' && (
            <>
              <div style={{ marginBottom: '12px' }}>
                <label style={labelStyle}>Canva / Presentación</label>
                <input
                  value={session.canva_url || ''}
                  onChange={e => onSessionChange({ ...session, canva_url: e.target.value })}
                  placeholder="https://canva.com/..."
                  style={inputStyle}
                />
              </div>

              {showPartial && (
                <div style={{ marginBottom: '12px' }}>
                  <label style={labelStyle}>Archivo del parcial</label>
                  <input
                    value={session.partial_file_url || ''}
                    onChange={e => onSessionChange({ ...session, partial_file_url: e.target.value })}
                    placeholder="https://drive.google.com/..."
                    style={inputStyle}
                  />
                </div>
              )}

              {showBio && (
                <div style={{ marginBottom: '12px' }}>
                  <label style={labelStyle}>Bio del invitado</label>
                  <input
                    value={session.guest_bio_url || ''}
                    onChange={e => onSessionChange({ ...session, guest_bio_url: e.target.value })}
                    placeholder="https://linkedin.com/..."
                    style={inputStyle}
                  />
                </div>
              )}

              {showBrief && (
                <div style={{ marginBottom: '12px' }}>
                  <label style={labelStyle}>Brief / Consigna del taller</label>
                  <input
                    value={session.workshop_brief_url || ''}
                    onChange={e => onSessionChange({ ...session, workshop_brief_url: e.target.value })}
                    placeholder="https://drive.google.com/..."
                    style={inputStyle}
                  />
                </div>
              )}

              <div>
                <label style={labelStyle}>Links adicionales</label>
                {addLinks.map((l, i) => (
                  <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <input
                      value={l.label}
                      onChange={e => {
                        const n = [...addLinks]
                        n[i] = { ...n[i], label: e.target.value }
                        onAddLinksChange(n)
                      }}
                      placeholder="Etiqueta"
                      style={{ width: '110px', padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }}
                    />
                    <input
                      value={l.url}
                      onChange={e => {
                        const n = [...addLinks]
                        n[i] = { ...n[i], url: e.target.value }
                        onAddLinksChange(n)
                      }}
                      placeholder="URL"
                      style={{ flex: 1, padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }}
                    />
                    <button
                      onClick={() => onAddLinksChange(addLinks.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: '#6b7280' }}
                    >
                      <i className="ti ti-trash" aria-hidden="true"></i>
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => onAddLinksChange([...addLinks, { label: '', url: '' }])}
                  style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: '12px', cursor: 'pointer', padding: '4px 0', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'inherit' }}
                >
                  <i className="ti ti-plus" aria-hidden="true"></i> Agregar link
                </button>
              </div>
            </>
          )}

          {/* TAB: Notas */}
          {modalTab === 'notes' && (
            <>
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Notas compartidas</label>
                <p style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '6px' }}>
                  Visibles para todo el equipo con acceso a este curso.
                </p>
                <textarea
                  value={session.shared_notes || ''}
                  onChange={e => onSessionChange({ ...session, shared_notes: e.target.value })}
                  rows={4}
                  placeholder="Notas del equipo docente..."
                  style={{ ...inputStyle, resize: 'vertical', minHeight: '80px' }}
                />
              </div>
              <div>
                <label style={{ ...labelStyle, color: '#9ca3af' }}>
                  Notas privadas <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(solo vos)</span>
                </label>
                <p style={{ fontSize: '11px', color: '#d1d5db', marginBottom: '6px' }}>Solo vos las ves.</p>
                <textarea
                  value={session.private_notes || ''}
                  onChange={e => onSessionChange({ ...session, private_notes: e.target.value })}
                  rows={3}
                  placeholder="Solo vos las verás..."
                  style={{ ...inputStyle, resize: 'vertical', opacity: 0.7 }}
                />
              </div>
            </>
          )}

          {/* TAB: Review post-clase */}
          {modalTab === 'review' && (
            <>
              {session.status !== 'dada' && (
                <div style={{
                  padding: '10px 14px', background: '#fef3c7',
                  borderRadius: '8px', fontSize: '12px', color: '#92400e', marginBottom: '16px',
                }}>
                  Esta sección es para revisar la clase después de haberla dado.
                  Podés completarla cuando el estado sea &quot;Dada&quot;.
                </div>
              )}

              {([
                { key: 'review_what_worked',  label: '✅ ¿Qué funcionó bien?',                    placeholder: 'Dinámicas, tiempos, participación...' },
                { key: 'review_what_didnt',   label: '❌ ¿Qué no funcionó?',                      placeholder: 'Problemas técnicos, falta de tiempo...' },
                { key: 'review_change_next',  label: '🔄 ¿Qué cambiarías para la próxima edición?', placeholder: '' },
                { key: 'review_add_next',     label: '➕ ¿Qué agregarías?',                       placeholder: '' },
                { key: 'review_next_year',    label: '📌 Observaciones para el próximo año',       placeholder: '' },
              ] as { key: keyof ExtendedSession; label: string; placeholder: string }[]).map(({ key, label, placeholder }) => (
                <div key={key} style={{ marginBottom: '14px' }}>
                  <label style={labelStyle}>{label}</label>
                  <textarea
                    value={(session[key] as string) || ''}
                    onChange={e => onSessionChange({ ...session, [key]: e.target.value })}
                    rows={2}
                    placeholder={placeholder}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>
              ))}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>⏱ Tiempo estimado de clase</label>
                  <input
                    value={session.review_time_estimated || ''}
                    onChange={e => onSessionChange({ ...session, review_time_estimated: e.target.value })}
                    placeholder="Ej: 90 min"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>⏱ Tiempo real demandado</label>
                  <input
                    value={session.review_time_real || ''}
                    onChange={e => onSessionChange({ ...session, review_time_real: e.target.value })}
                    placeholder="Ej: 110 min"
                    style={inputStyle}
                  />
                </div>
              </div>
            </>
          )}

          {/* TAB: Horario */}
          {modalTab === 'schedule' && (
            <>
              <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
                Horario y aula del encuentro. Se usa para la vista de Agenda y detección de superposiciones.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={labelStyle}>Hora de inicio</label>
                  <input
                    type="time"
                    value={session.start_time || ''}
                    onChange={e => onSessionChange({ ...session, start_time: e.target.value })}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Hora de fin</label>
                  <input
                    type="time"
                    value={session.end_time || ''}
                    onChange={e => onSessionChange({ ...session, end_time: e.target.value })}
                    style={inputStyle}
                  />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Aula / Sala / Lugar</label>
                <input
                  value={session.location || ''}
                  onChange={e => onSessionChange({ ...session, location: e.target.value })}
                  placeholder="Ej: Aula 2 - Edificio A"
                  style={inputStyle}
                />
              </div>
            </>
          )}

          {/* Eliminar — solo admin, solo en edición */}
          {!isNew && isAdmin && (
            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #fee2e2' }}>
              <button
                onClick={onDelete}
                style={{
                  background: '#fee2e2', color: '#dc2626',
                  border: '1px solid #fca5a5', borderRadius: '6px',
                  padding: '6px 12px', fontSize: '12px',
                  cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}
              >
                <i className="ti ti-trash" aria-hidden="true"></i> Eliminar encuentro
              </button>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: '14px 22px',
          borderTop: '1px solid #e5e7eb',
          display: 'flex', justifyContent: 'flex-end', gap: '8px',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px', background: 'transparent',
              border: '1px solid #e5e7eb', borderRadius: '8px',
              fontSize: '13px', cursor: 'pointer',
              fontFamily: 'inherit', color: '#6b7280',
            }}
          >
            Cancelar
          </button>
          {canEdit && (
            <button
              onClick={onSave}
              disabled={saving}
              style={{
                padding: '8px 16px', background: '#6366f1', color: 'white',
                border: 'none', borderRadius: '8px', fontSize: '13px',
                fontWeight: 500, cursor: saving ? 'wait' : 'pointer',
                opacity: saving ? 0.7 : 1, fontFamily: 'inherit',
              }}
            >
              {saving ? 'Guardando...' : isNew ? 'Crear clase' : 'Guardar cambios'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
