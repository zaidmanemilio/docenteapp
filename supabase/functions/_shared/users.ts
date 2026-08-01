// supabase/functions/_shared/users.ts
//
// Port de src/lib/users/server-helpers.ts al runtime de Edge Functions.
// La lógica es la misma (validaciones, alta con rollback, edición) para que el
// comportamiento no cambie al migrar.
//
// Única diferencia deliberada: la detección de duplicados ya no arma el filtro
// concatenando texto (`email.eq.${email},dni.eq.${dni}`). Ese patrón mezcla
// valores con la sintaxis de filtros de PostgREST, y un email válido según el
// regex puede contener paréntesis o comas y romper la consulta. Acá se usan
// .eq()/.in(), que el cliente codifica por su cuenta.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export function normalizeEmail(email: string): string {
  return (email || '').trim().toLowerCase()
}

/** DNI sin espacios, puntos ni guiones. */
export function normalizeDni(dni: string): string {
  return (dni || '').replace(/[\s.\-]/g, '')
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface NewUserInput {
  first_name: string
  last_name: string
  email: string
  dni: string
  password: string
  status?: 'activo' | 'pendiente' | 'inactivo'
  global_role?: string
}

export interface UpdateUserInput {
  id: string
  first_name: string
  last_name: string
  email: string
  dni: string
  password?: string
  global_role?: string
}

/** Valida un usuario de entrada. Lista vacía = ok. */
export function validateNewUser(u: Partial<NewUserInput>): string[] {
  const errors: string[] = []
  if (!u.first_name?.trim()) errors.push('Falta el nombre.')
  if (!u.last_name?.trim()) errors.push('Falta el apellido.')
  if (!u.email?.trim()) errors.push('Falta el email.')
  else if (!EMAIL_RE.test(normalizeEmail(u.email))) errors.push('Email inválido.')
  if (!u.dni?.trim()) errors.push('Falta el DNI.')
  if (!u.password) errors.push('Falta la contraseña.')
  else if (u.password.length < 8) errors.push('La contraseña debe tener al menos 8 caracteres.')
  return errors
}

/**
 * Crea el usuario en Auth y completa su perfil.
 * El perfil lo crea automáticamente el trigger on_auth_user_created, así que
 * acá se ACTUALIZA (insertar chocaría con la PK). Se reintenta por si el
 * trigger tarda un instante, y si aun así falla se borra el usuario de Auth
 * para no dejar una cuenta sin perfil utilizable.
 */
export async function createUserWithProfile(
  admin: SupabaseClient,
  u: NewUserInput,
): Promise<{ ok: boolean; error?: string; userId?: string }> {
  const email = normalizeEmail(u.email)
  const dni = normalizeDni(u.dni)
  const fullName = `${u.first_name.trim()} ${u.last_name.trim()}`.trim()

  // 1) Duplicados ya existentes en profiles.
  const [{ data: byEmail }, { data: byDni }] = await Promise.all([
    admin.from('profiles').select('id').eq('email', email).limit(1),
    admin.from('profiles').select('id').eq('dni', dni).limit(1),
  ])
  if (byEmail && byEmail.length > 0) {
    return { ok: false, error: `Ya existe un usuario con el email ${email}.` }
  }
  if (byDni && byDni.length > 0) {
    return { ok: false, error: `Ya existe un usuario con el DNI ${dni}.` }
  }

  // 2) Alta en Auth. email_confirm:true porque la app no manda correos.
  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email,
    password: u.password,
    email_confirm: true,
    user_metadata: { full_name: fullName, global_role: u.global_role || 'teacher' },
  })
  if (authErr || !created?.user) {
    return { ok: false, error: `Auth: ${authErr?.message || 'no se pudo crear el usuario'}` }
  }

  const userId = created.user.id
  const patch = {
    full_name: fullName,
    first_name: u.first_name.trim(),
    last_name: u.last_name.trim(),
    email,
    dni,
    status: u.status || 'activo',
    global_role: u.global_role || 'teacher',
    auth_user_id: userId,
  }

  let profErr: { message: string } | null = null
  let updated = false
  for (let attempt = 0; attempt < 3 && !updated; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 250)) // esperar al trigger
    const { data, error } = await admin
      .from('profiles')
      .update(patch)
      .eq('id', userId)
      .select('id')
    profErr = error ? { message: error.message } : null
    if (!error && data && data.length > 0) updated = true
  }

  if (!updated) {
    await admin.auth.admin.deleteUser(userId) // rollback
    return {
      ok: false,
      error: `Perfil: ${profErr?.message || 'no se pudo completar el perfil tras crear el usuario'}`,
    }
  }

  return { ok: true, userId }
}

/** Edita datos administrativos en profiles + email/password en Auth. */
export async function updateUserWithProfile(
  admin: SupabaseClient,
  u: UpdateUserInput,
): Promise<{ ok: boolean; error?: string }> {
  if (!u.id) return { ok: false, error: 'Falta el id del usuario.' }
  if (!u.first_name?.trim()) return { ok: false, error: 'Falta el nombre.' }
  if (!u.last_name?.trim()) return { ok: false, error: 'Falta el apellido.' }
  if (!u.email?.trim()) return { ok: false, error: 'Falta el email.' }
  if (!EMAIL_RE.test(normalizeEmail(u.email))) return { ok: false, error: 'Email inválido.' }
  if (!u.dni?.trim()) return { ok: false, error: 'Falta el DNI.' }
  if (u.password && u.password.length < 8) {
    return { ok: false, error: 'La contraseña debe tener al menos 8 caracteres.' }
  }

  const email = normalizeEmail(u.email)
  const dni = normalizeDni(u.dni)
  const fullName = `${u.first_name.trim()} ${u.last_name.trim()}`.trim()

  // 1) Duplicados en OTROS usuarios.
  const [{ data: byEmail }, { data: byDni }] = await Promise.all([
    admin.from('profiles').select('id').eq('email', email).neq('id', u.id).limit(1),
    admin.from('profiles').select('id').eq('dni', dni).neq('id', u.id).limit(1),
  ])
  if (byEmail && byEmail.length > 0) return { ok: false, error: `Otro usuario ya tiene el email ${email}.` }
  if (byDni && byDni.length > 0) return { ok: false, error: `Otro usuario ya tiene el DNI ${dni}.` }

  // 2) Auth (el id del profile == id de Auth).
  const authPatch: { email: string; password?: string } = { email }
  if (u.password) authPatch.password = u.password
  const { error: authErr } = await admin.auth.admin.updateUserById(u.id, authPatch)
  if (authErr) return { ok: false, error: `Auth: ${authErr.message}` }

  // 3) Perfil administrativo.
  const profilePatch: Record<string, string> = {
    full_name: fullName,
    first_name: u.first_name.trim(),
    last_name: u.last_name.trim(),
    email,
    dni,
  }
  if (u.global_role && ['admin', 'teacher', 'guest'].includes(u.global_role)) {
    profilePatch.global_role = u.global_role
  }
  const { error: profErr } = await admin.from('profiles').update(profilePatch).eq('id', u.id)
  if (profErr) return { ok: false, error: `Perfil: ${profErr.message}` }

  return { ok: true }
}

/** Busca qué emails/DNIs de una lista ya existen en la base. */
export async function findExisting(
  admin: SupabaseClient,
  emails: string[],
  dnis: string[],
): Promise<{ emails: Set<string>; dnis: Set<string> }> {
  const outEmails = new Set<string>()
  const outDnis = new Set<string>()

  if (emails.length > 0) {
    const { data } = await admin.from('profiles').select('email').in('email', emails)
    for (const r of data || []) outEmails.add(normalizeEmail(r.email || ''))
  }
  if (dnis.length > 0) {
    const { data } = await admin.from('profiles').select('dni').in('dni', dnis)
    for (const r of data || []) outDnis.add(normalizeDni(r.dni || ''))
  }
  return { emails: outEmails, dnis: outDnis }
}
