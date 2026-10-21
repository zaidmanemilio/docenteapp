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

// ─────────────────────────────────────────────────────────────────────────────
// VOCABULARIO ÚNICO
// ─────────────────────────────────────────────────────────────────────────────
// La app nombraba lo mismo de cinco maneras distintas según la pantalla:
//
//   global_role 'teacher' →  "Docente" (sidebar)
//                            "Sin rol global" (editar usuario)
//                            "Docente (sin acceso global, solo cursos…)" (alta)
//   global_role 'guest'   →  "Invitado" / "Lectura global" / "Invitado / Lectura global"
//   permission            →  "full"/"edit"/"read" crudos en Configuración,
//                            "Full"/"Edición"/"Lectura" en Presentación,
//                            "Lectura (read)" en Usuarios.
//
// Dos problemas concretos: "Invitado" ya significa otra cosa en esta app (hay
// un TIPO de clase llamado "Invitado"), y mostrar "full"/"edit"/"read" obliga
// al usuario a aprender el vocabulario de la base de datos.
//
// Desde acá sale un solo nombre para cada valor, con su explicación. Si hay
// que renombrar algo, se renombra en un solo lugar.

export type GlobalRole = 'admin' | 'guest' | 'teacher'

/** Nombre del rol global. Es lo que se puede hacer en TODA la plataforma. */
export const ROLE_LABEL: Record<string, string> = {
  admin:   'Administrador',
  guest:   'Observador',
  teacher: 'Docente',
}

/** Una línea que explica el alcance del rol. Va al lado del nombre, no en su lugar. */
export const ROLE_HINT: Record<string, string> = {
  admin:   'Acceso total a todos los cursos y a la gestión de usuarios.',
  guest:   'Ve todos los cursos, en modo lectura.',
  teacher: 'Solo los cursos que se le asignen, con el permiso que se le dé en cada uno.',
}

export const ROLE_BADGE: Record<string, string> = {
  admin:   'badge-accent',
  guest:   'badge-info',
  teacher: 'badge-neutral',
}

/** Nombre del permiso sobre UN curso. */
export const PERM_LABEL: Record<string, string> = {
  full: 'Coordinación',
  edit: 'Edición',
  read: 'Lectura',
}

export const PERM_HINT: Record<string, string> = {
  full: 'Edita y además puede eliminar encuentros y configurar el curso.',
  edit: 'Edita encuentros y tareas; no puede eliminar.',
  read: 'Solo consulta.',
}

export const PERM_BADGE: Record<string, string> = {
  full: 'badge-accent',
  edit: 'badge-info',
  read: 'badge-neutral',
}

/** Orden en el que se ofrecen los permisos en los desplegables. */
export const PERM_ORDER: ('full' | 'edit' | 'read')[] = ['full', 'edit', 'read']
export const ROLE_ORDER: GlobalRole[] = ['teacher', 'guest', 'admin']

export function roleLabel(r: string | null | undefined): string {
  return ROLE_LABEL[r || ''] || 'Docente'
}
export function permLabel(p: string | null | undefined): string {
  return PERM_LABEL[p || ''] || 'Sin acceso'
}
