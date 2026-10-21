// src/components/schedule/SessionLinks.tsx
//
// Los links de un encuentro (Canva, archivo del parcial, bio del invitado,
// brief del taller, Zoom del curso y los adicionales).
//
// Estaban escritos a mano dentro de la tabla del Cronograma, y por eso la
// Agenda —que es la vista que se usa— no los mostraba: para abrir un Canva
// había que ir a la otra pantalla o entrar al encuentro. Acá viven una sola
// vez y los usan las dos vistas.
import type { ExtendedSession } from './SessionModal'

const LINK_DEFS = [
  { field: 'canva_url',          icon: 'ti-presentation',    label: 'Canva / Presentación' },
  { field: 'partial_file_url',   icon: 'ti-file-text',       label: 'Archivo del parcial',
    soloTipos: ['parcial', 'recuperatorio'] },
  { field: 'guest_bio_url',      icon: 'ti-user-circle',     label: 'Bio del invitado',
    soloTipos: ['invitado'] },
  { field: 'workshop_brief_url', icon: 'ti-clipboard-list',  label: 'Brief / Consigna',
    soloTipos: ['taller'] },
] as const

function urlDe(s: ExtendedSession, field: string): string {
  switch (field) {
    case 'canva_url':          return s.canva_url || ''
    case 'partial_file_url':   return s.partial_file_url || ''
    case 'guest_bio_url':      return s.guest_bio_url || ''
    case 'workshop_brief_url': return s.workshop_brief_url || ''
    default: return ''
  }
}

/** ¿Este encuentro tiene algún link para mostrar? */
export function tieneLinks(s: ExtendedSession, zoomUrl?: string): boolean {
  if ((s.additional_links || []).length > 0) return true
  if (s.modality === 'virtual' && !s.canva_url && zoomUrl) return true
  return LINK_DEFS.some(d => urlDe(s, d.field))
}

const chip: React.CSSProperties = {
  width: '24px', height: '24px', borderRadius: '4px',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  fontSize: '13px', textDecoration: 'none', flexShrink: 0,
}
const chipLleno: React.CSSProperties = {
  ...chip,
  background: 'var(--chip-accent-bg)',
  border: '1px solid var(--chip-accent-bd)',
  color: 'var(--accent)',
}
const chipVacio: React.CSSProperties = {
  ...chip,
  background: 'var(--hover-bg)',
  border: '1px solid var(--border)',
  color: 'var(--text-muted)',
}

export default function SessionLinks({
  session, zoomUrl, huecos = false,
}: {
  session: ExtendedSession
  zoomUrl?: string
  /** La tabla reserva el lugar de los links que faltan; la agenda no. */
  huecos?: boolean
}) {
  const mostrarZoom = session.modality === 'virtual' && !session.canva_url && !!zoomUrl

  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
      {LINK_DEFS.map(def => {
        const aplica = !('soloTipos' in def) || (def.soloTipos as readonly string[]).includes(session.type)
        if (!aplica) return null
        const url = urlDe(session, def.field)
        if (!url) {
          return huecos
            ? <span key={def.field} style={chipVacio} title={`Sin ${def.label.toLowerCase()}`}>
                <i className={`ti ${def.icon}`} aria-hidden="true"></i>
              </span>
            : null
        }
        return (
          <a key={def.field} href={url} target="_blank" rel="noopener noreferrer"
            title={def.label} aria-label={def.label}
            onClick={e => e.stopPropagation()}
            style={chipLleno}>
            <i className={`ti ${def.icon}`} aria-hidden="true"></i>
          </a>
        )
      })}

      {mostrarZoom && (
        <a href={zoomUrl} target="_blank" rel="noopener noreferrer"
          title="Zoom del curso" aria-label="Zoom del curso"
          onClick={e => e.stopPropagation()}
          style={chipLleno}>
          <i className="ti ti-video" aria-hidden="true"></i>
        </a>
      )}

      {(session.additional_links || []).map((link, i) => (
        <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
          title={link.label || `Link ${i + 1}`} aria-label={link.label || `Link ${i + 1}`}
          onClick={e => e.stopPropagation()}
          style={chipLleno}>
          <i className="ti ti-link" aria-hidden="true"></i>
        </a>
      ))}
    </div>
  )
}
