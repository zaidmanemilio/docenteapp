// supabase/functions/_shared/cors.ts
//
// Hoy estas operaciones las llama el propio servidor de Next (mismo origen) y
// por eso no hacía falta CORS. Cuando el front sea estático las va a llamar el
// navegador contra el dominio de Supabase: eso es cross-origin y el navegador
// exige preflight + cabeceras explícitas.
//
// Los orígenes permitidos se configuran con el secreto ALLOWED_ORIGINS
// (separados por coma). Ej:
//   https://docenteapp.ednunlp.com.ar,http://localhost:3000
// Si no está seteado se permite cualquiera, para no romper durante la
// transición; conviene setearlo antes de publicar.

const BASE_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

function allowedOrigins(): string[] {
  return (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean)
}

/** Cabeceras CORS para la respuesta, según el Origin del pedido. */
export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const allowed = allowedOrigins()

  // Sin lista configurada: permitir cualquiera (modo transición).
  if (allowed.length === 0) {
    return { ...BASE_HEADERS, 'Access-Control-Allow-Origin': origin || '*' }
  }
  // Con lista: solo se refleja el origen si está autorizado.
  if (origin && allowed.includes(origin)) {
    return { ...BASE_HEADERS, 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
  }
  return { ...BASE_HEADERS, 'Access-Control-Allow-Origin': allowed[0], Vary: 'Origin' }
}

/** Respuesta al preflight OPTIONS. */
export function preflight(req: Request): Response {
  return new Response('ok', { headers: corsHeaders(req) })
}

/** JSON + CORS, para no repetir en cada función. */
export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}
