// src/app/api/users/update/route.ts
// Edición de un usuario (datos administrativos + email/password en Auth).
// Corre solo en servidor. Verifica admin antes de usar el cliente admin.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  updateUserWithProfile, assertIsAdmin, type UpdateUserInput,
} from '@/lib/users/server-helpers'

export async function POST(request: Request) {
  const supabase = await createClient()
  const auth = await assertIsAdmin(supabase)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 })

  let body: Partial<UpdateUserInput>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido.' }, { status: 400 })
  }
  if (!body.id) return NextResponse.json({ error: 'Falta el id del usuario.' }, { status: 400 })

  const admin = createAdminClient()
  const result = await updateUserWithProfile(admin, body as UpdateUserInput)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
