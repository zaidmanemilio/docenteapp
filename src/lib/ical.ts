// src/lib/ical.ts
// Genera un archivo .ics (iCalendar) con el cronograma de un curso, para
// importar en Apple Calendar, Google Calendar, Outlook, etc.
//
// SOBRE LAS ZONAS HORARIAS
// Las clases se cargan en hora local del curso (ej. 18:00 en Argentina), pero
// quien importa el archivo puede estar en otro huso. En vez de calcular "la
// diferencia" y escribir una hora ya corrida —que se rompe cuando cambia el
// horario de verano de cualquiera de los dos lados—, cada clase se convierte
// al instante absoluto en UTC y se escribe con sufijo Z. La app de calendario
// lo muestra en la hora local de cada persona, siempre bien.
//
// Ejemplo real: una clase de 18:00 en Argentina se ve en Madrid a las 23:00
// hasta el último domingo de octubre y a las 22:00 después. Con UTC eso sale
// solo; con una diferencia fija, la mitad del curso queda corrido.

export interface IcalSession {
  id: string
  class_number?: number | null
  title: string
  date: string          // YYYY-MM-DD
  start_time?: string | null  // HH:MM
  end_time?: string | null    // HH:MM
  status?: string | null
  modality?: string | null
  location?: string | null
  responsible?: string | null
}

export interface IcalOptions {
  courseName: string
  timezone: string      // zona IANA, ej. America/Argentina/Buenos_Aires
  zoomUrl?: string | null
  /** Duración por defecto, en minutos, si la clase no tiene hora de fin. */
  defaultDurationMin?: number
}

/** Desfase de una zona respecto de UTC, en milisegundos, para un instante dado. */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant)
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value)
  const asIfUtc = Date.UTC(
    get('year'), get('month') - 1, get('day'),
    get('hour') % 24, get('minute'), get('second'),
  )
  return asIfUtc - instant.getTime()
}

/**
 * Convierte una hora de pared ("2026-10-06" + "18:00" en Buenos Aires) al
 * instante UTC que le corresponde.
 *
 * Se hace en dos pasadas porque el desfase depende del instante, y el instante
 * es justamente lo que se está buscando: la primera pasada da una aproximación
 * y la segunda la corrige si cayó del otro lado de un cambio de horario.
 */
export function wallTimeToUtc(date: string, time: string, timeZone: string): Date | null {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  if ([y, m, d, hh, mm].some(n => Number.isNaN(n))) return null

  const naive = Date.UTC(y, m - 1, d, hh, mm, 0)
  let utc = naive - tzOffsetMs(new Date(naive), timeZone)
  const check = naive - tzOffsetMs(new Date(utc), timeZone)
  if (check !== utc) utc = check
  return new Date(utc)
}

/** Fecha/hora en el formato de iCalendar, en UTC: 20261006T210000Z */
function fmtUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** Fecha suelta (evento de día completo): 20261006 */
function fmtDate(date: string): string {
  return date.replace(/-/g, '')
}

/** Escapa los caracteres que iCalendar trata como separadores. */
function esc(text: string): string {
  return (text || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * Corta las líneas a 75 octetos, como exige el RFC 5545. Se cuenta en bytes y
 * no en caracteres: con acentos y eñes una línea "corta" puede pasarse, y
 * algunos calendarios rechazan el archivo entero.
 */
function fold(line: string): string {
  const enc = new TextEncoder()
  if (enc.encode(line).length <= 75) return line

  const out: string[] = []
  let current = ''
  let bytes = 0
  for (const ch of line) {
    const chBytes = enc.encode(ch).length
    // 74 para dejar lugar al espacio inicial de la línea de continuación
    if (bytes + chBytes > (out.length === 0 ? 75 : 74)) {
      out.push(current)
      current = ''
      bytes = 0
    }
    current += ch
    bytes += chBytes
  }
  if (current) out.push(current)
  return out.join('\r\n ')
}

/**
 * Arma el .ics del cronograma.
 *
 * Se excluyen:
 *  - el encuentro 0 (es la ficha "ESTRUCTURA DEL CURSO", no una clase),
 *  - los encuentros cancelados.
 */
export function buildCourseIcs(sessions: IcalSession[], opts: IcalOptions): string {
  const { courseName, timezone, zoomUrl } = opts
  const durMin = opts.defaultDurationMin ?? 120
  const stamp = fmtUtc(new Date())

  const included = sessions
    .filter(s => s.class_number !== 0)
    .filter(s => s.status !== 'cancelada')
    .filter(s => !!s.date)
    .sort((a, b) => (a.date).localeCompare(b.date) || (a.start_time || '').localeCompare(b.start_time || ''))

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DocenteApp//Cronograma//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(courseName)}`,
    `X-WR-TIMEZONE:${timezone}`,
  ]

  for (const s of included) {
    const esVirtual = (s.modality || '').toLowerCase() === 'virtual'
    const link = esVirtual ? (zoomUrl || '') : ''

    const desc: string[] = []
    if (s.class_number != null) desc.push(`Encuentro ${s.class_number}: ${s.title}`)
    else desc.push(s.title)
    if (s.responsible) desc.push(`Responsable: ${s.responsible}`)
    if (link) desc.push(`Videollamada: ${link}`)

    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${s.id}@docenteapp`)
    lines.push(`DTSTAMP:${stamp}`)

    if (s.start_time) {
      const ini = wallTimeToUtc(s.date, s.start_time, timezone)
      const fin = s.end_time
        ? wallTimeToUtc(s.date, s.end_time, timezone)
        : (ini ? new Date(ini.getTime() + durMin * 60000) : null)
      if (ini && fin) {
        // Si la hora de fin es menor que la de inicio, la clase cruza la
        // medianoche: termina al día siguiente.
        const finReal = fin.getTime() <= ini.getTime()
          ? new Date(fin.getTime() + 24 * 3600 * 1000)
          : fin
        lines.push(`DTSTART:${fmtUtc(ini)}`)
        lines.push(`DTEND:${fmtUtc(finReal)}`)
      }
    } else {
      // Sin horario cargado: evento de día completo.
      const next = new Date(`${s.date}T00:00:00Z`)
      next.setUTCDate(next.getUTCDate() + 1)
      lines.push(`DTSTART;VALUE=DATE:${fmtDate(s.date)}`)
      lines.push(`DTEND;VALUE=DATE:${fmtDate(next.toISOString().slice(0, 10))}`)
    }

    lines.push(`SUMMARY:${esc(courseName)}`)
    lines.push(`DESCRIPTION:${esc(desc.join('\n'))}`)

    const location = link || s.location || ''
    if (location) lines.push(`LOCATION:${esc(location)}`)
    if (link) {
      lines.push(`URL:${link}`)
      // Hace que Google Calendar muestre el botón de "Unirse".
      lines.push(`X-GOOGLE-CONFERENCE:${link}`)
    }

    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** Nombre de archivo seguro: "END - Agilidad" -> "END-Agilidad.ics" */
export function icsFileName(courseName: string): string {
  const base = (courseName || 'cronograma')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${base || 'cronograma'}.ics`
}
