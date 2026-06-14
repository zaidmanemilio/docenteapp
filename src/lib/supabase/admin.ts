// src/lib/supabase/admin.ts
// Cliente de Supabase con privilegios de servicio (service_role).
//
// ⚠️ SOLO PARA USO EN EL SERVIDOR (route handlers / server actions).
// Nunca importar este archivo desde un componente cliente: expondría la
// service_role key, que tiene acceso total a la base sin pasar por RLS.
import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  // Guarda defensiva: si esto corre en el navegador, abortar.
  if (typeof window !== 'undefined') {
    throw new Error('createAdminClient solo puede usarse en el servidor.')
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      'Faltan variables de entorno: NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.'
    )
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
