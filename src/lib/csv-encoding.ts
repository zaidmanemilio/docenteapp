// src/lib/csv-encoding.ts
// Lee un archivo de texto (CSV) detectando la codificación correcta.
//
// Problema que resuelve: Excel exporta CSV en codificaciones distintas según
// el sistema: UTF-8, Windows-1252 (Latin-1) o Mac Roman. Si se decodifica con
// la equivocada, los acentos se rompen de formas distintas:
//   - leído como UTF-8 cuando no lo es  -> "Mart�n"
//   - "í" Mac Roman leída como 1252      -> "Mart‡n", "Innovaci—n"
// Estrategia: probar las tres codificaciones y quedarnos con la que produzca
// el texto más "sano" (más letras acentuadas del español, menos basura).

const CANDIDATES = ['windows-1252', 'x-mac-roman'] as const

// Letras acentuadas y signos del español esperables en datos reales.
const GOOD = /[áéíóúñüÁÉÍÓÚÑÜ¿¡]/g
// Símbolos que casi nunca aparecen en datos reales y delatan una mala
// decodificación (caja de reemplazo y los típicos de Mac Roman mal leído).
const BAD = /[\uFFFD‡—˜›œ„‰Š‹Œ]/g

function score(text: string): number {
  const good = (text.match(GOOD) || []).length
  const bad = (text.match(BAD) || []).length
  return good - bad * 3 // penaliza fuerte la basura
}

export async function readCsvFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()

  // UTF-8 estricto: si el archivo ES utf-8, esta es siempre la correcta.
  try {
    const utf8 = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    return stripBom(utf8)
  } catch {
    // No es UTF-8 válido: comparar candidatas de byte único por puntuación.
  }

  let best = ''
  let bestScore = -Infinity
  for (const enc of CANDIDATES) {
    try {
      const text = new TextDecoder(enc).decode(buffer)
      const s = score(text)
      if (s > bestScore) { bestScore = s; best = text }
    } catch {
      // codificación no soportada por el navegador: ignorar
    }
  }
  return stripBom(best)
}

function stripBom(s: string): string {
  return s.replace(/^\ufeff/, '')
}
