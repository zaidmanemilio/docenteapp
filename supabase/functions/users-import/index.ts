// supabase/functions/users-import/index.ts
// Importación masiva de usuarios. Reemplaza a /api/users/import.
//
// El CSV se parsea en el navegador y acá llegan las filas ya cortadas.
// Funciona en dos pasadas, igual que antes:
//   commit:false → previsualización: valida todo y devuelve los errores.
//   commit:true  → crea, pero solo si no hay ningún error.
//
//   entrada : { rows: [{ nombre, apellido, email, dni, password, _row? }], commit? }
//   salida (preview) : { ok, preview:true, total, errors:[{row, errors:[]}] }
//   salida (commit)  : { ok, created, failed:[{row, error}], total }
import { preflight, json } from '../_shared/cors.ts'
import { createAdminClient, assertIsAdmin } from '../_shared/auth.ts'
import {
  validateNewUser, createUserWithProfile, findExisting,
  normalizeEmail, normalizeDni, type NewUserInput,
} from '../_shared/users.ts'

// Fila cruda del CSV: claves en español, tal como vienen del archivo.
type RawRow = Record<string, string> & { _row?: number | string }
interface ImportRow extends Partial<NewUserInput> { _row?: number }

function mapCsvRow(r: RawRow): ImportRow {
  return {
    _row: typeof r._row === 'string' ? parseInt(r._row, 10) : r._row,
    first_name: (r.nombre ?? r.first_name ?? '').trim(),
    last_name: (r.apellido ?? r.last_name ?? '').trim(),
    email: (r.email ?? '').trim(),
    dni: (r.dni ?? '').trim(),
    password: r.password ?? '',
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight(req)
  if (req.method !== 'POST') return json(req, { error: 'Método no permitido.' }, 405)

  const admin = createAdminClient()

  const auth = await assertIsAdmin(req, admin)
  if (!auth.ok) return json(req, { error: auth.error }, auth.status ?? 403)

  let body: { rows?: RawRow[]; commit?: boolean }
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'Body inválido.' }, 400)
  }

  const rawRows = body.rows || []
  if (rawRows.length === 0) return json(req, { error: 'CSV vacío.' }, 400)
  const rows: ImportRow[] = rawRows.map(mapCsvRow)

  // 1) Validación por fila + duplicados DENTRO del propio CSV.
  const seenEmail = new Map<string, number>()
  const seenDni = new Map<string, number>()
  const rowErrors: { row: number; errors: string[] }[] = []

  rows.forEach((r, i) => {
    const n = r._row ?? i + 1
    const errs = validateNewUser(r)
    const email = normalizeEmail(r.email || '')
    const dni = normalizeDni(r.dni || '')
    if (email) {
      if (seenEmail.has(email)) errs.push(`Email duplicado en el CSV (fila ${seenEmail.get(email)}).`)
      else seenEmail.set(email, n)
    }
    if (dni) {
      if (seenDni.has(dni)) errs.push(`DNI duplicado en el CSV (fila ${seenDni.get(dni)}).`)
      else seenDni.set(dni, n)
    }
    if (errs.length) rowErrors.push({ row: n, errors: errs })
  })

  // 2) Duplicados contra lo que ya está en la base.
  const existing = await findExisting(admin, [...seenEmail.keys()], [...seenDni.keys()])
  rows.forEach((r, i) => {
    const n = r._row ?? i + 1
    const email = normalizeEmail(r.email || '')
    const dni = normalizeDni(r.dni || '')
    const extra: string[] = []
    if (email && existing.emails.has(email)) extra.push('El email ya existe en la base.')
    if (dni && existing.dnis.has(dni)) extra.push('El DNI ya existe en la base.')
    if (extra.length) {
      const found = rowErrors.find(e => e.row === n)
      if (found) found.errors.push(...extra)
      else rowErrors.push({ row: n, errors: extra })
    }
  })

  // 3) Previsualización, o cualquier error: no se crea nada.
  if (!body.commit || rowErrors.length > 0) {
    return json(req, {
      ok: rowErrors.length === 0,
      preview: true,
      total: rows.length,
      errors: rowErrors.sort((a, b) => a.row - b.row),
    })
  }

  // 4) Commit: crear todas. Se informa qué se creó y qué falló.
  const results = { created: 0, failed: [] as { row: number; error: string }[] }
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const n = r._row ?? i + 1
    const result = await createUserWithProfile(admin, r as NewUserInput)
    if (result.ok) results.created++
    else results.failed.push({ row: n, error: result.error || 'error desconocido' })
  }

  return json(req, { ok: results.failed.length === 0, ...results, total: rows.length })
})
