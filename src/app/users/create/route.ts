// src/app/api/users/create/route.ts
// Alta manual de un usuario. Corre solo en servidor.
// Verifica que quien llama sea admin (sesión normal) antes de usar el
// cliente admin (service_role) para crear el usuario en Auth + perfil.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  validateNewUser, createUserWithProfile, assertIsAdmin, type NewUserInput,
} from '@/lib/users/server-helpers'

export async function POST(request: Request) {
  // 1) Autorización: la sesión del que llama debe ser admin.
  const supabase = await createClient()
  const auth = await assertIsAdmin(supabase)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 })

  // 2) Leer y validar el body.
  let body: Partial<NewUserInput>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido.' }, { status: 400 })
  }
  const errors = validateNewUser(body)
  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join(' ') }, { status: 400 })
  }

  // 3) Crear con el cliente admin.
  const admin = createAdminClient()
  const result = await createUserWithProfile(admin, body as NewUserInput)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ ok: true, userId: result.userId })
}
