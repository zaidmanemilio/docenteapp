// src/lib/users/server-helpers.ts
// Helpers de servidor para alta de usuarios (manual e importación CSV).
// No se importan desde el cliente.
import type { SupabaseClient } from '@supabase/supabase-js'

export function normalizeEmail(email: string): string {
  return (email || '').trim().toLowerCase()
}

// DNI sin espacios, puntos ni guiones.
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
  global_role?: string // 'admin' | 'teacher' | 'guest' (mapeo interno)
}

// Valida un usuario de entrada. Devuelve lista de errores (vacía = ok).
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

// Crea un usuario en Supabase Auth + perfil interno.
// Recibe el cliente admin (service_role). Devuelve {ok, error}.
// El password se usa solo aquí y se descarta; nunca se persiste en profiles.
export async function createUserWithProfile(
  admin: SupabaseClient,
  u: NewUserInput
): Promise<{ ok: boolean; error?: string; userId?: string }> {
  const email = normalizeEmail(u.email)
  const dni = normalizeDni(u.dni)
  const fullName = `${u.first_name.trim()} ${u.last_name.trim()}`.trim()

  // 1) Duplicados en profiles (email o dni ya existentes).
  const { data: dupe } = await admin
    .from('profiles')
    .select('id, email, dni')
    .or(`email.eq.${email},dni.eq.${dni}`)
    .limit(1)
  if (dupe && dupe.length > 0) {
    const d = dupe[0]
    if (normalizeEmail(d.email || '') === email) return { ok: false, error: `Ya existe un usuario con el email ${email}.` }
    return { ok: false, error: `Ya existe un usuario con el DNI ${dni}.` }
  }

  // 2) Crear en Supabase Auth. email_confirm:true porque no enviamos correos.
  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email,
    password: u.password,
    email_confirm: true,
    user_metadata: { full_name: fullName, global_role: u.global_role || 'teacher' },
  })
  if (authErr || !created?.user) {
    return { ok: false, error: `Auth: ${authErr?.message || 'no se pudo crear el usuario'}` }
  }

  // 3) El trigger `on_auth_user_created` (handle_new_user) ya creó el perfil
  //    automáticamente con el id del nuevo usuario. En vez de insertar (lo que
  //    chocaría con la PK), ACTUALIZAMOS ese perfil con los datos completos.
  //    Reintentamos por si el perfil tarda un instante en materializarse.
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
    // Rollback: si no se pudo completar el perfil, borrar el auth user para
    // no dejar un usuario sin perfil utilizable.
    await admin.auth.admin.deleteUser(userId)
    return { ok: false, error: `Perfil: ${profErr?.message || 'no se pudo completar el perfil tras crear el usuario'}` }
  }

  return { ok: true, userId }
}

// Verifica que el usuario de la sesión sea admin global.
// Recibe un cliente normal (anon, con la sesión por cookies).
export async function assertIsAdmin(
  supabase: SupabaseClient
): Promise<{ ok: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado.' }
  const { data: profile } = await supabase
    .from('profiles').select('global_role').eq('id', user.id).single()
  if (profile?.global_role !== 'admin') {
    return { ok: false, error: 'Solo un administrador puede crear usuarios.' }
  }
  return { ok: true }
}

export interface UpdateUserInput {
  id: string // id del profile (== id de Auth)
  first_name: string
  last_name: string
  email: string
  dni: string
  password?: string // opcional: solo si se quiere cambiar
}

// Edita un usuario: datos administrativos en profiles + email/password en Auth.
// El password (si viene) se usa solo aquí y se descarta.
export async function updateUserWithProfile(
  admin: SupabaseClient,
  u: UpdateUserInput
): Promise<{ ok: boolean; error?: string }> {
  if (!u.id) return { ok: false, error: 'Falta el id del usuario.' }
  if (!u.first_name?.trim()) return { ok: false, error: 'Falta el nombre.' }
  if (!u.last_name?.trim()) return { ok: false, error: 'Falta el apellido.' }
  if (!u.email?.trim()) return { ok: false, error: 'Falta el email.' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(u.email))) return { ok: false, error: 'Email inválido.' }
  if (!u.dni?.trim()) return { ok: false, error: 'Falta el DNI.' }
  if (u.password && u.password.length < 8) return { ok: false, error: 'La contraseña debe tener al menos 8 caracteres.' }

  const email = normalizeEmail(u.email)
  const dni = normalizeDni(u.dni)
  const fullName = `${u.first_name.trim()} ${u.last_name.trim()}`.trim()

  // 1) Duplicados de email/dni en OTROS usuarios (no el actual).
  const { data: dupe } = await admin
    .from('profiles')
    .select('id, email, dni')
    .or(`email.eq.${email},dni.eq.${dni}`)
    .neq('id', u.id)
    .limit(1)
  if (dupe && dupe.length > 0) {
    const d = dupe[0]
    if (normalizeEmail(d.email || '') === email) return { ok: false, error: `Otro usuario ya tiene el email ${email}.` }
    return { ok: false, error: `Otro usuario ya tiene el DNI ${dni}.` }
  }

  // 2) Actualizar email y/o password en Auth (el id del profile == id de Auth).
  const authPatch: { email?: string; password?: string } = {}
  // Solo actualizar email en Auth si cambió, para no disparar reverificación innecesaria.
  authPatch.email = email
  if (u.password) authPatch.password = u.password
  const { error: authErr } = await admin.auth.admin.updateUserById(u.id, authPatch)
  if (authErr) {
    return { ok: false, error: `Auth: ${authErr.message}` }
  }

  // 3) Actualizar el perfil administrativo.
  const { error: profErr } = await admin.from('profiles').update({
    full_name: fullName,
    first_name: u.first_name.trim(),
    last_name: u.last_name.trim(),
    email,
    dni,
  }).eq('id', u.id)
  if (profErr) {
    return { ok: false, error: `Perfil: ${profErr.message}` }
  }

  return { ok: true }
}
