// src/lib/backup/course-restore.ts
// Restauración de un curso a partir de un archivo de respaldo JSON.
//
// DECISIÓN DE DISEÑO (seguridad): la restauración SIEMPRE crea un curso
// NUEVO con IDs nuevos. Nunca pisa un curso existente. Así, restaurar es
// una operación segura: en el peor caso, genera un curso duplicado que se
// puede borrar, pero jamás destruye datos buenos.
//
// No restaura permisos (user_course_permissions): los IDs de usuario del
// respaldo pueden no coincidir con los actuales y asignar permisos es
// sensible. El admin reasigna permisos a mano tras restaurar.

import type { SupabaseClient } from '@supabase/supabase-js'
import { BACKUP_VERSION, type CourseBackup } from './course-backup'

export interface RestoreResult {
  ok: boolean
  error?: string
  newCourseId?: string
  counts?: { commissions: number; sessions: number; todos: number }
}

// Valida que el objeto tenga la forma esperada de un respaldo.
export function validateBackup(data: unknown): { ok: boolean; error?: string; backup?: CourseBackup } {
  if (!data || typeof data !== 'object') return { ok: false, error: 'El archivo no es un respaldo válido.' }
  const b = data as Partial<CourseBackup>
  if (typeof b.backup_version !== 'number') return { ok: false, error: 'Falta la versión del respaldo.' }
  if (b.backup_version > BACKUP_VERSION) return { ok: false, error: `El respaldo es de una versión más nueva (${b.backup_version}) que la app.` }
  if (!b.course || typeof b.course !== 'object') return { ok: false, error: 'El respaldo no contiene un curso.' }
  if (!Array.isArray(b.sessions) || !Array.isArray(b.commissions) || !Array.isArray(b.todos)) {
    return { ok: false, error: 'El respaldo está incompleto (faltan clases, comisiones o tareas).' }
  }
  return { ok: true, backup: b as CourseBackup }
}

// Quita campos que no deben copiarse al crear filas nuevas.
function stripIdentity<T extends Record<string, unknown>>(row: T, dropCourseId = false): Partial<T> {
  const out: Record<string, unknown> = { ...row }
  delete out.id
  delete out.created_at
  delete out.updated_at
  if (dropCourseId) delete out.course_id
  return out as Partial<T>
}

export async function restoreCourseFromBackup(
  supabase: SupabaseClient,
  backup: CourseBackup
): Promise<RestoreResult> {
  // 1) Crear el curso nuevo (sin id/fechas; nombre marcado como restaurado).
  const courseData = stripIdentity(backup.course)
  const baseName = (backup.course.name as string) || 'Curso restaurado'
  courseData.name = `${baseName} (restaurado)`

  const { data: newCourse, error: courseErr } = await supabase
    .from('courses')
    .insert(courseData)
    .select('id')
    .single()
  if (courseErr || !newCourse) {
    return { ok: false, error: `No se pudo crear el curso: ${courseErr?.message || 'error desconocido'}` }
  }
  const newCourseId = newCourse.id as string

  // 2) Comisiones. Guardamos el mapeo viejo->nuevo por si las clases
  //    referencian comisiones por commission_scope = commission_id.
  const commMap = new Map<string, string>()
  if (backup.commissions.length > 0) {
    for (const comm of backup.commissions) {
      const oldId = comm.id as string
      const data = stripIdentity(comm, true)
      data.course_id = newCourseId
      const { data: created, error } = await supabase
        .from('commissions').insert(data).select('id').single()
      if (error) {
        // Rollback: borrar el curso recién creado para no dejar basura.
        await supabase.from('courses').delete().eq('id', newCourseId)
        return { ok: false, error: `Error restaurando comisiones: ${error.message}` }
      }
      if (created) commMap.set(oldId, created.id as string)
    }
  }

  // 3) Clases. Reapuntar commission_scope si era un commission_id.
  if (backup.sessions.length > 0) {
    const rows = backup.sessions.map(s => {
      const data = stripIdentity(s, true)
      data.course_id = newCourseId
      const scope = s.commission_scope as string
      if (scope && scope !== 'all' && commMap.has(scope)) {
        data.commission_scope = commMap.get(scope)
      }
      return data
    })
    const { error } = await supabase.from('sessions').insert(rows)
    if (error) {
      await supabase.from('courses').delete().eq('id', newCourseId)
      return { ok: false, error: `Error restaurando clases: ${error.message}` }
    }
  }

  // 4) Tareas.
  if (backup.todos.length > 0) {
    const rows = backup.todos.map(t => {
      const data = stripIdentity(t, true)
      data.course_id = newCourseId
      // Las tareas pueden referenciar session_id; al ser IDs viejos, los
      // soltamos (la tarea queda a nivel curso, sin vincular a una clase).
      delete data.session_id
      return data
    })
    const { error } = await supabase.from('todos').insert(rows)
    if (error) {
      // No hacemos rollback total acá: curso + clases ya valen. Avisamos.
      return { ok: false, error: `Curso y clases restaurados, pero falló restaurar tareas: ${error.message}` }
    }
  }

  return {
    ok: true,
    newCourseId,
    counts: {
      commissions: backup.commissions.length,
      sessions: backup.sessions.length,
      todos: backup.todos.length,
    },
  }
}
