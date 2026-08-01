// supabase/functions/users-create/index.ts
// Alta manual de un usuario. Reemplaza a /api/users/create.
//
// Mantiene el mismo contrato que la ruta de Next para que el front solo tenga
// que cambiar la URL:
//   entrada : { first_name, last_name, email, dni, password, status?, global_role? }
//   salida  : { ok: true, userId } | { error: "..." }
import { preflight, json } from '../_shared/cors.ts'
import { createAdminClient, assertIsAdmin } from '../_shared/auth.ts'
import { validateNewUser, createUserWithProfile, type NewUserInput } from '../_shared/users.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight(req)
  if (req.method !== 'POST') return json(req, { error: 'Método no permitido.' }, 405)

  const admin = createAdminClient()

  // 1) Solo un admin puede dar de alta usuarios.
  const auth = await assertIsAdmin(req, admin)
  if (!auth.ok) return json(req, { error: auth.error }, auth.status ?? 403)

  // 2) Body.
  let body: Partial<NewUserInput>
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'Body inválido.' }, 400)
  }

  const errors = validateNewUser(body)
  if (errors.length > 0) return json(req, { error: errors.join(' ') }, 400)

  // 3) Alta.
  const result = await createUserWithProfile(admin, body as NewUserInput)
  if (!result.ok) return json(req, { error: result.error }, 400)

  return json(req, { ok: true, userId: result.userId })
})
