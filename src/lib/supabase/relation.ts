// src/lib/supabase/relation.ts
//
// PostgREST devuelve un OBJETO cuando la relación es a-uno
// (`profiles(full_name)` sobre una clave foránea única), pero sin los tipos
// generados de la base, supabase-js infiere un ARRAY. De ahí salían cuatro de
// los seis errores de tipado que arrastraba el proyecto, y la razón por la
// que el build corría con ignoreBuildErrors.
//
// En vez de callar el error con un cast —que mentiría si algún día la
// consulta sí devuelve varias filas— esto normaliza el valor en el borde:
// una fila o nada, venga como venga.
export function unaFila<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}
