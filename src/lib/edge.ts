// src/lib/edge.ts
// Llama a las Edge Functions de Supabase desde el navegador.
//
// Reemplaza a los fetch contra /api/users/*, que necesitaban un servidor
// propio. Las funciones corren en Supabase, que es donde vive la service_role
// key; el navegador solo manda su token de sesión y la función decide.
//
// La respuesta mantiene la forma { ok, data } que ya usaban los llamadores.
import { createClient } from '@/lib/supabase/client'

const FUNCTIONS_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function callEdgeFunction<T = any>(
  name: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; data: T }> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify(body),
  })

  // Si la función devolvió algo que no es JSON (por ejemplo un error de la
  // plataforma), no explotar acá: dejar que el llamador muestre su mensaje.
  const data = await res.json().catch(() => ({} as T))
  return { ok: res.ok, status: res.status, data: data as T }
}
