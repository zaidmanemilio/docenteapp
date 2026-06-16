// src/lib/backup/course-backup.ts
// Lógica de respaldo/exportación de un curso. Se usa desde el cliente.
// - buildCourseBackup: arma un objeto JSON con todo el curso.
// - downloadJson / downloadCsv: disparan la descarga en el navegador.
// - coursesToCsv y demás: generan CSV legibles por tabla.
//
// La RESTAURACIÓN vive en course-restore.ts (iteración aparte dentro de
// esta feature) para mantener separada la lógica de escritura.

import type { SupabaseClient } from '@supabase/supabase-js'

// Versión del formato de respaldo. Si el modelo cambia, se incrementa
// para que la restauración sepa con qué está tratando.
export const BACKUP_VERSION = 1

export interface CourseBackup {
  backup_version: number
  exported_at: string
  course: Record<string, unknown>
  commissions: Record<string, unknown>[]
  sessions: Record<string, unknown>[]
  todos: Record<string, unknown>[]
  permissions: Record<string, unknown>[]
}

// Trae todo el curso desde Supabase y lo arma en un objeto.
export async function buildCourseBackup(
  supabase: SupabaseClient,
  courseId: string
): Promise<CourseBackup> {
  const [courseRes, commsRes, sessionsRes, todosRes, permsRes] = await Promise.all([
    supabase.from('courses').select('*').eq('id', courseId).single(),
    supabase.from('commissions').select('*').eq('course_id', courseId),
    supabase.from('sessions').select('*').eq('course_id', courseId).order('class_number'),
    supabase.from('todos').select('*').eq('course_id', courseId),
    supabase.from('user_course_permissions').select('*').eq('course_id', courseId),
  ])

  if (courseRes.error) throw new Error(`No se pudo leer el curso: ${courseRes.error.message}`)

  return {
    backup_version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    course: courseRes.data,
    commissions: commsRes.data || [],
    sessions: sessionsRes.data || [],
    todos: todosRes.data || [],
    permissions: permsRes.data || [],
  }
}

// ---------- Descargas ----------

export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  triggerDownload(blob, filename)
}

export function downloadCsv(csv: string, filename: string) {
  // BOM para que Excel respete acentos.
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, filename)
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ---------- CSV legibles ----------

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  let s = typeof value === 'object' ? JSON.stringify(value) : String(value)
  // Escapar comillas y envolver si hay separadores o saltos.
  if (/[",\n;]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"'
  return s
}

function rowsToCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.join(',')
  const body = rows.map(r => columns.map(c => csvCell(r[c])).join(',')).join('\n')
  return header + '\n' + body
}

// CSV del cronograma (clases) — el más útil para leer/compartir.
export function sessionsToCsv(sessions: Record<string, unknown>[]): string {
  return rowsToCsv(sessions, [
    'class_number', 'date', 'title', 'type', 'responsible',
    'modality', 'status', 'commission_scope', 'canva_url',
    'shared_notes',
  ])
}

// CSV de tareas.
export function todosToCsv(todos: Record<string, unknown>[]): string {
  return rowsToCsv(todos, [
    'title', 'description', 'responsible', 'due_date', 'status', 'priority',
  ])
}
