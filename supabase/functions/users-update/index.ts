// supabase/functions/users-update/index.ts
// Edición de un usuario. Reemplaza a /api/users/update.
//
//   entrada : { id, first_name, last_name, email, dni, password?, global_role? }
//   salida  : { ok: true } | { error: "..." }
import { preflight, json } from '../_shared/cors.ts'
import { createAdminClient, assertIsAdmin } from '../_shared/auth.ts'
import { updateUserWithProfile, type UpdateUserInput } from '../_shared/users.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight(req)
  if (req.method !== 'POST') return json(req, { error: 'Método no permitido.' }, 405)

  const admin = createAdminClient()

  const auth = await assertIsAdmin(req, admin)
  if (!auth.ok) return json(req, { error: auth.error }, auth.status ?? 403)

  let body: Partial<UpdateUserInput>
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'Body inválido.' }, 400)
  }
  if (!body.id) return json(req, { error: 'Falta el id del usuario.' }, 400)

  const result = await updateUserWithProfile(admin, body as UpdateUserInput)
  if (!result.ok) return json(req, { error: result.error }, 400)

  return json(req, { ok: true })
})
