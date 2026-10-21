// src/components/schedule/SessionCard.tsx
//
// La tarjeta de un encuentro en la vista Agenda.
//
// Viene de la pantalla Agenda, que era la más cómoda de leer pero mostraba
// menos de lo que tenía el Cronograma: no traía los links (había que ir a la
// tabla para abrir un Canva), ni el aviso de notas o review pendientes, ni el
// encuentro 0. Ahora la tarjeta carga todo eso y las dos pantallas son una.
import type { Commission } from '@/types'
import { SESSION_TYPE_LABELS, SESSION_STATUS_LABELS } from '@/types'
import type { ExtendedSession } from './SessionModal'
import SessionLinks from './SessionLinks'

/** Color de la barra lateral de la tarjeta y del evento en la grilla mensual.
 *  Es decoración, no texto: no tiene que pasar contraste. */
export const TYPE_COLORS: Record<string, string> = {
  teorica: '#6366f1', practica: '#0d9488', taller: '#d97706',
  invitado: '#be185d', parcial: '#dc2626', recuperatorio: '#f97316',
  exposicion: '#7c3aed', proyecto: '#059669',
}

/** Insignia del tipo. La Agenda pintaba el texto con TYPE_COLORS sobre ese
 *  mismo color al 12%: en tema oscuro daba 2,6:1 y no se leía. Las clases
 *  .badge-* del sistema ya tienen un par de colores por tema. */
export const TYPE_BADGE: Record<string, string> = {
  teorica:      'badge-info',
  practica:     'badge-teal',
  taller:       'badge-warning',
  invitado:     'badge-pink',
  parcial:      'badge-danger',
  recuperatorio:'badge-orange',
  exposicion:   'badge-accent',
  proyecto:     'badge-success',
}

const STATUS_COLORS: Record<string, string> = {
  dada: 'var(--success)', pendiente: 'var(--text-muted)',
  reprogramada: 'var(--warning)', cancelada: 'var(--danger)',
}

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

/** 'YYYY-MM-DD' → { dia: 'Mar', numero: '17' } */
function partesFecha(d: string) {
  const [y, m, day] = d.split('-')
  // El mediodía evita que la zona horaria corra el día al parsear.
  const nombre = DIAS[new Date(`${y}-${m}-${day}T12:00:00`).getDay()]
  return { dia: nombre, numero: String(parseInt(day, 10)) }
}

export interface SessionCardProps {
  session: ExtendedSession
  commissions: Commission[]
  zoomUrl?: string
  hoy: string
  /** Primera clase de hoy en adelante: se señala como la que viene. */
  esProxima?: boolean
  /** Choca el horario con otro encuentro del mismo día. */
  esSuperpuesta?: boolean
  canEdit: boolean
  onOpen: () => void
  /** Edición masiva: si está activa, la tarjeta muestra su casilla. */
  bulkMode?: boolean
  seleccionada?: boolean
  onToggleSelect?: () => void
}

export default function SessionCard({
  session: s, commissions, zoomUrl, hoy, esProxima, esSuperpuesta,
  canEdit, onOpen, bulkMode, seleccionada, onToggleSelect,
}: SessionCardProps) {
  const esFicha   = s.class_number === 0
  const esHoy     = !!s.date && s.date === hoy
  const esVencida = !!s.date && s.date < hoy && s.status === 'pendiente'
  const com       = commissions.find(c => c.id === s.commission_scope)
  const hayReview = !!(s.review_what_worked || s.review_what_didnt || s.review_change_next)
  const color     = esFicha ? 'var(--text-muted)' : (TYPE_COLORS[s.type] || 'var(--text-muted)')

  const borde =
    esSuperpuesta ? 'var(--warning)' :
    esHoy         ? 'var(--accent)'  :
    esVencida     ? 'var(--danger)'  : 'var(--border)'

  return (
    <div
      className={`session-card${esProxima ? ' is-next' : ''}`}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      aria-label={`${s.title}. ${SESSION_STATUS_LABELS[s.status] || s.status}.`}
      style={{
        borderColor: borde,
        borderLeft: `4px solid ${color}`,
        background: seleccionada ? 'var(--chip-accent-bg)' : 'var(--surface)',
        opacity: s.status === 'cancelada' ? 0.6 : 1,
      }}
    >
      {bulkMode && (
        <input
          type="checkbox"
          checked={!!seleccionada}
          onChange={onToggleSelect}
          onClick={e => e.stopPropagation()}
          aria-label={`Seleccionar ${s.title}`}
          style={{ width: '16px', height: '16px', cursor: 'pointer', flexShrink: 0, marginTop: '2px' }}
        />
      )}

      {/* Columna de fecha. El encuentro 0 no tiene: es la ficha del curso. */}
      <div className="session-card-date" aria-hidden={esFicha || !s.date}>
        {esFicha || !s.date ? (
          <i className="ti ti-file-description" style={{ fontSize: '20px', color: 'var(--text-muted)' }}></i>
        ) : (
          <>
            <div className="session-card-dow" style={{ color: esHoy ? 'var(--accent)' : 'var(--text-muted)' }}>
              {partesFecha(s.date).dia}
            </div>
            <div className="session-card-day" style={{ color: esHoy ? 'var(--accent)' : 'var(--text-primary)' }}>
              {partesFecha(s.date).numero}
            </div>
          </>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '4px' }}>
          <span style={{
            fontSize: 'var(--text-base)', fontWeight: 600, flex: 1,
            textDecoration: s.status === 'cancelada' ? 'line-through' : 'none',
          }}>
            {s.title}
          </span>
          {esFicha ? (
            <span className="badge badge-neutral">Ficha del curso</span>
          ) : (
            <span className={`badge ${TYPE_BADGE[s.type] || 'badge-neutral'}`} style={{ flexShrink: 0 }}>
              {SESSION_TYPE_LABELS[s.type] || s.type}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', flexWrap: 'wrap', alignItems: 'center' }}>
          {typeof s.class_number === 'number' && (
            <span>{esFicha ? 'Encuentro 0' : `Clase ${s.class_number}`}</span>
          )}
          {s.responsible && <span><i className="ti ti-user" aria-hidden="true"></i> {s.responsible}</span>}
          {s.start_time && (
            <span><i className="ti ti-clock" aria-hidden="true"></i> {s.start_time}{s.end_time ? `–${s.end_time}` : ''}</span>
          )}
          {s.location && <span><i className="ti ti-map-pin" aria-hidden="true"></i> {s.location}</span>}
          {!esFicha && (
            <span><i className={`ti ${s.modality === 'virtual' ? 'ti-device-laptop' : 'ti-building'}`} aria-hidden="true"></i>{' '}
              {s.modality === 'virtual' ? 'Virtual' : 'Presencial'}</span>
          )}
          {commissions.length > 1 && (
            <span><i className="ti ti-users" aria-hidden="true"></i>{' '}
              {s.commission_scope === 'all' ? 'Todas' : (com?.name || s.commission_scope)}</span>
          )}
          {!esFicha && (
            <span style={{ color: STATUS_COLORS[s.status] || 'var(--text-muted)', fontWeight: 600 }}>
              {SESSION_STATUS_LABELS[s.status] || s.status}
            </span>
          )}
        </div>

        {/* Links y señales. Antes esto solo existía en la tabla. */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <SessionLinks session={s} zoomUrl={zoomUrl} />

          {s.shared_notes && (
            <span className="session-flag"><i className="ti ti-notes" aria-hidden="true"></i> Notas</span>
          )}
          {hayReview && (
            <span className="session-flag" style={{ color: 'var(--success)' }}>
              <i className="ti ti-circle-check" aria-hidden="true"></i> Review
            </span>
          )}
          {s.status === 'dada' && !hayReview && (
            <span className="session-flag" style={{ color: 'var(--warning)' }}>
              <i className="ti ti-alert-circle" aria-hidden="true"></i> Sin review
            </span>
          )}
          {esSuperpuesta && (
            <span className="badge badge-warning">Posible superposición</span>
          )}
          {esVencida && (
            <span className="badge badge-danger">Fecha pasada, sigue pendiente</span>
          )}
        </div>
      </div>

      {canEdit && (
        <div style={{ color: 'var(--text-muted)', fontSize: '16px', flexShrink: 0, alignSelf: 'center' }}>
          <i className="ti ti-pencil" aria-hidden="true"></i>
        </div>
      )}
    </div>
  )
}
