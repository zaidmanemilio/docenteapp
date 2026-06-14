// src/lib/permissions.ts
// Regla única de permiso efectivo de un usuario sobre UN curso.
// Centraliza la lógica para que todas las pantallas la usen igual.
//
// Modelo (mapeo interno admin/teacher/guest):
//   - admin  (full global)  -> 'full'  : ve y edita todo.
//   - guest  (read global)  -> al menos 'read' en cualquier curso; 'edit'/'full'
//                              si además tiene un permiso por curso superior.
//   - teacher (sin global)  -> solo lo que tenga asignado por curso.
//
// Devuelve: 'full' | 'edit' | 'read' | null (null = sin acceso).

const RANK: Record<string, number> = { full: 3, edit: 2, read: 1 }

export type EffectivePermission = 'full' | 'edit' | 'read' | null

export function effectiveCoursePermission(
  globalRole: string | null | undefined,
  coursePerms: { permission: string }[]
): EffectivePermission {
  if (globalRole === 'admin') return 'full'

  // Mejor permiso por curso asignado (si hay).
  let best: EffectivePermission = null
  for (const row of coursePerms) {
    if (!best || (RANK[row.permission] || 0) > (RANK[best] || 0)) {
      best = row.permission as EffectivePermission
    }
  }

  // guest = lectura global: si no tiene un permiso por curso mayor, igual lee.
  if (globalRole === 'guest') {
    if (!best || RANK[best] < RANK['read']) return 'read'
    return best
  }

  // teacher (sin rol global): solo lo asignado por curso.
  return best
}

export function canEdit(p: EffectivePermission): boolean {
  return p === 'full' || p === 'edit'
}
export function canDelete(p: EffectivePermission): boolean {
  return p === 'full'
}
