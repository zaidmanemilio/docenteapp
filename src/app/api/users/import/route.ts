// src/app/api/users/import/route.ts
// Importación masiva de usuarios. Corre solo en servidor.
// Recibe filas ya parseadas del CSV (parsing en cliente), valida todas,
// y crea solo si no hay errores. Los passwords se usan y se descartan.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  validateNewUser, createUserWithProfile, assertIsAdmin,
  normalizeEmail, normalizeDni, type NewUserInput,
} from '@/lib/users/server-helpers'

// Fila cruda del CSV: claves en español tal como vienen del archivo.
type RawRow = Record<string, string> & { _row?: number | string }

// Mapea una fila del CSV (nombre/apellido/email/dni/password) a la estructura
// interna que esperan validateNewUser y createUserWithProfile.
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

interface ImportRow extends Partial<NewUserInput> { _row?: number }

export async function POST(request: Request) {
  const supabase = await createClient()
  const auth = await assertIsAdmin(supabase)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 })

  let body: { rows?: RawRow[]; commit?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido.' }, { status: 400 })
  }
  const rawRows = body.rows || []
  if (rawRows.length === 0) return NextResponse.json({ error: 'CSV vacío.' }, { status: 400 })
  // Normaliza las claves del CSV (español) a la estructura interna.
  const rows: ImportRow[] = rawRows.map(mapCsvRow)

  // 1) Validación por fila + duplicados DENTRO del CSV.
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

  // 2) Duplicados contra la BASE (emails y dnis ya existentes).
  const admin = createAdminClient()
  const emails = [...seenEmail.keys()]
  const dnis = [...seenDni.keys()]
  if (emails.length) {
    const { data: existing } = await admin.from('profiles').select('email, dni')
      .or(`email.in.(${emails.join(',')}),dni.in.(${dnis.join(',')})`)
    const exEmails = new Set((existing || []).map(e => normalizeEmail(e.email || '')))
    const exDnis = new Set((existing || []).map(e => normalizeDni(e.dni || '')))
    rows.forEach((r, i) => {
      const n = r._row ?? i + 1
      const email = normalizeEmail(r.email || '')
      const dni = normalizeDni(r.dni || '')
      const extra: string[] = []
      if (email && exEmails.has(email)) extra.push('El email ya existe en la base.')
      if (dni && exDnis.has(dni)) extra.push('El DNI ya existe en la base.')
      if (extra.length) {
        const found = rowErrors.find(e => e.row === n)
        if (found) found.errors.push(...extra)
        else rowErrors.push({ row: n, errors: extra })
      }
    })
  }

  // 3) Si es solo previsualización, o hay errores, devolver sin crear.
  if (!body.commit || rowErrors.length > 0) {
    return NextResponse.json({
      ok: rowErrors.length === 0,
      preview: true,
      total: rows.length,
      errors: rowErrors.sort((a, b) => a.row - b.row),
    })
  }

  // 4) Commit: crear todos. Reporta éxitos y fallos.
  const results = { created: 0, failed: [] as { row: number; error: string }[] }
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const n = r._row ?? i + 1
    const result = await createUserWithProfile(admin, r as NewUserInput)
    if (result.ok) results.created++
    else results.failed.push({ row: n, error: result.error || 'error desconocido' })
  }

  return NextResponse.json({ ok: results.failed.length === 0, ...results, total: rows.length })
}
