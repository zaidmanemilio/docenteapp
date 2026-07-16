// src/lib/supabase/session.ts
// Helpers de sesión para Server Components, deduplicados por request con cache().
//
// PROBLEMA que resuelven: cada layout/página que llamaba supabase.auth.getUser()
// hacía una llamada de red al servidor de Auth de Supabase para revalidar el JWT.
// Al abrir /courses/[id]/dashboard se apilan 3 server components (app-layout →
// course-layout → dashboard) y cada uno revalidaba + volvía a traer el perfil.
//
// SOLUCIÓN: React cache() memoiza el resultado durante un mismo request de render,
// así getUser() pega a la red UNA vez por navegación (en vez de 3) y el perfil se
// consulta UNA vez (en vez de 2). Middleware sigue teniendo su propia validación
// (corre en el Edge, en otro contexto) — eso es esperado y necesario.
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Usuario autenticado (validado contra Auth), deduplicado por request.
 * Devuelve null si no hay sesión.
 */
export const getUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})

/**
 * Perfil completo del usuario actual, deduplicado por request.
 * Devuelve null si no hay sesión o no existe el perfil.
 */
export const getProfile = cache(async () => {
  const user = await getUser()
  if (!user) return null

  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return data
})

/**
 * Igual que getProfile() pero garantiza sesión + perfil: si falta cualquiera,
 * redirige a /login. Pensado para layouts/páginas protegidas.
 */
export const requireProfile = cache(async () => {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  return profile
})
