// src/lib/csv-encoding.ts
// Lee un archivo de texto (CSV) detectando la codificación correcta.
//
// Problema que resuelve: Excel suele exportar CSV en Windows-1252 (Latin-1),
// no en UTF-8. Si se lee como UTF-8, los acentos aparecen como "�"
// (p. ej. "Martín" -> "Mart�n"). Esta función lee los bytes crudos y:
//   1) intenta decodificar como UTF-8 estricto;
//   2) si falla (bytes inválidos), cae a Windows-1252.

export async function readCsvFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()

  // Intento 1: UTF-8 estricto. Si hay bytes inválidos, lanza y caemos al 2.
  try {
    const utf8 = new TextDecoder('utf-8', { fatal: true })
    return stripBom(utf8.decode(buffer))
  } catch {
    // Intento 2: Windows-1252 (Latin-1 extendido), el típico de Excel.
    const win1252 = new TextDecoder('windows-1252')
    return stripBom(win1252.decode(buffer))
  }
}

function stripBom(s: string): string {
  return s.replace(/^\ufeff/, '')
}
