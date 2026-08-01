// supabase/functions/_shared/auth.ts
//
// Equivalente a assertIsAdmin() de src/lib/users/server-helpers.ts, pero para
// el runtime de Edge Functions.
//
// Diferencia importante con la versión de Next: allá la sesión venía en una
// cookie que leía el servidor. Acá el navegador manda el access token en la
// cabecera Authorization, así que hay que validarlo explícitamente.
//
// El rol se lee SIEMPRE de la tabla profiles con el cliente de servicio, nunca
// de los metadatos del JWT: los metadatos los puede modificar el propio
// usuario (de hecho la app los usa para el curso fijado), así que confiar en
// ellos para autorizar permitiría que cualquiera se declarase admin.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

/** Cliente con service_role: saltea RLS. Solo para uso interno de la función. */
export function createAdminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) {
    throw new Error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.')
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export interface AdminCheck {
  ok: boolean
  error?: string
  status?: number
  userId?: string
}

/**
 * Verifica que quien llama esté autenticado y sea admin global.
 * Devuelve {ok:false, status} listo para responder.
 */
export async function assertIsAdmin(
  req: Request,
  admin: SupabaseClient,
): Promise<AdminCheck> {
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    return { ok: false, error: 'No autenticado.', status: 401 }
  }

  // Valida el token contra Auth y devuelve a quién pertenece.
  const { data: { user }, error } = await admin.auth.getUser(token)
  if (error || !user) {
    return { ok: false, error: 'Sesión inválida o vencida.', status: 401 }
  }

  // El rol se lee de la base, no del token.
  const { data: profile } = await admin
    .from('profiles')
    .select('global_role')
    .eq('id', user.id)
    .single()

  if (profile?.global_role !== 'admin') {
    return { ok: false, error: 'Solo un administrador puede gestionar usuarios.', status: 403 }
  }

  return { ok: true, userId: user.id }
}
