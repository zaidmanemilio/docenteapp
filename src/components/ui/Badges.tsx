// src/components/ui/Badges.tsx
//
// Las dos insignias que aparecen en media docena de pantallas. Estaban
// escritas a mano en cada una, con textos y colores que no coincidían.
import {
  ROLE_BADGE, ROLE_HINT, PERM_BADGE, PERM_HINT, roleLabel, permLabel,
} from '@/lib/permissions'

/** Rol global de un usuario (toda la plataforma). */
export function RoleBadge({ role }: { role: string | null | undefined }) {
  const key = role || 'teacher'
  return (
    <span className={`badge ${ROLE_BADGE[key] || 'badge-neutral'}`} title={ROLE_HINT[key]}>
      {roleLabel(key)}
    </span>
  )
}

/** Permiso de un usuario sobre UN curso. */
export function PermBadge({ permission }: { permission: string | null | undefined }) {
  if (!permission) {
    return <span className="badge badge-neutral" title="No tiene acceso a este curso.">Sin acceso</span>
  }
  return (
    <span className={`badge ${PERM_BADGE[permission] || 'badge-neutral'}`} title={PERM_HINT[permission]}>
      {permLabel(permission)}
    </span>
  )
}
