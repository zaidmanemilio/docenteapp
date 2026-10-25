// src/lib/session-focus.ts
//
// "Focos": recortes con nombre del cronograma de un curso — los encuentros
// sin Canva, los que ya pasaron y siguen pendientes, los virtuales…
//
// Existen porque el Panel contaba una cosa y el Cronograma filtraba otra. El
// Panel decía "4 clases sin link a presentación" y no había forma de ver
// cuáles: el número era un callejón sin salida, y la regla que lo calculaba
// vivía solo en el Panel. Acá la regla se declara una vez: el Panel cuenta
// con ella y el Cronograma filtra con ella, así el número que tocás y la
// lista que te aparece no pueden diferir.
//
// El foco viaja en la URL (?f=sin-canva), que es lo que hace que el Panel
// pueda enlazar al detalle.
import { isChecklistComplete, normalizeChecklist } from '@/lib/moodle'
import type { ExtendedSession } from '@/components/schedule/SessionModal'

export const FOCUS_PARAM = 'f'

export interface Foco {
  /** Lo que va en la URL. */
  key: string
  /** Título de la fila en el Panel. */
  titulo: string
  /** Cómo se lee en el Cronograma: "Mostrando <etiqueta>". */
  etiqueta: string
  icono: string
  tono: 'danger' | 'warning' | 'info' | 'neutral'
  /** Qué hay que hacer con estos encuentros. Solo se usa en el Panel. */
  ayuda: string
  aplica: (s: ExtendedSession, hoy: string) => boolean
}

/** Una clase cancelada no le debe nada a nadie: nunca es un pendiente. */
const viva = (s: ExtendedSession) => s.status !== 'cancelada'

export const FOCOS: Foco[] = [
  {
    key: 'vencidas',
    titulo: 'Clases que ya pasaron y siguen en Pendiente',
    etiqueta: 'las clases vencidas sin marcar',
    icono: 'ti-calendar-x',
    tono: 'danger',
    ayuda: 'Marcalas como dadas, reprogramadas o canceladas.',
    aplica: (s, hoy) => s.status === 'pendiente' && !!s.date && s.date < hoy,
  },
  {
    key: 'sin-responsable',
    titulo: 'Encuentros sin responsable',
    etiqueta: 'los encuentros sin responsable',
    icono: 'ti-user-x',
    tono: 'warning',
    ayuda: 'Nadie figura a cargo del dictado.',
    aplica: s => viva(s) && !s.responsible,
  },
  {
    key: 'sin-canva',
    titulo: 'Encuentros sin presentación',
    etiqueta: 'los encuentros sin presentación',
    icono: 'ti-presentation-off',
    tono: 'warning',
    ayuda: 'Falta el link al Canva o la presentación que se proyecta.',
    aplica: s => viva(s)
      && !s.canva_url
      && !['parcial', 'recuperatorio', 'exposicion', 'proyecto'].includes(s.type),
  },
  {
    key: 'sin-brief',
    titulo: 'Talleres sin consigna',
    etiqueta: 'los talleres sin consigna',
    icono: 'ti-clipboard-off',
    tono: 'warning',
    ayuda: 'Falta el brief que reciben los estudiantes.',
    aplica: s => viva(s) && s.type === 'taller' && !s.workshop_brief_url,
  },
  {
    key: 'sin-parcial',
    titulo: 'Parciales sin archivo',
    etiqueta: 'los parciales sin archivo',
    icono: 'ti-file-alert',
    tono: 'warning',
    ayuda: 'Falta subir el enunciado del parcial o recuperatorio.',
    aplica: s => viva(s)
      && ['parcial', 'recuperatorio'].includes(s.type)
      && !s.partial_file_url,
  },
  {
    key: 'sin-bio',
    titulo: 'Invitados sin bio',
    etiqueta: 'los encuentros con invitado sin bio',
    icono: 'ti-user-question',
    tono: 'warning',
    ayuda: 'Falta la bio de quien viene a dar la clase.',
    aplica: s => viva(s) && s.type === 'invitado' && !s.guest_bio_url,
  },
  {
    key: 'sin-moodle',
    titulo: 'Clases dadas sin publicar en Moodle',
    etiqueta: 'las clases dadas sin publicar en Moodle',
    icono: 'ti-school',
    tono: 'info',
    ayuda: 'El material de la clase todavía no está en el aula virtual.',
    aplica: s => s.status === 'dada'
      && !isChecklistComplete(normalizeChecklist(s.moodle_checklist)),
  },
  // Los de abajo no son pendientes: son recortes a los que el Panel enlaza
  // desde sus tarjetas.
  {
    key: 'pendiente',
    titulo: 'Clases por dar',
    etiqueta: 'las clases por dar',
    icono: 'ti-clock',
    tono: 'neutral',
    ayuda: '',
    aplica: s => s.status === 'pendiente',
  },
  {
    key: 'dada',
    titulo: 'Clases dadas',
    etiqueta: 'las clases dadas',
    icono: 'ti-circle-check',
    tono: 'neutral',
    ayuda: '',
    aplica: s => s.status === 'dada',
  },
  {
    key: 'virtual',
    titulo: 'Encuentros virtuales',
    etiqueta: 'los encuentros virtuales',
    icono: 'ti-device-laptop',
    tono: 'neutral',
    ayuda: '',
    aplica: s => s.modality === 'virtual',
  },
  {
    key: 'presencial',
    titulo: 'Encuentros presenciales',
    etiqueta: 'los encuentros presenciales',
    icono: 'ti-building',
    tono: 'neutral',
    ayuda: '',
    aplica: s => s.modality === 'presencial',
  },
]

/** Los que el Panel lista como cosas para resolver, en orden de urgencia. */
export const FOCOS_PENDIENTES = FOCOS.filter(f => f.tono !== 'neutral')

export function buscarFoco(key: string | null | undefined): Foco | null {
  if (!key) return null
  // tipo:<t> no está en la lista: se arma al vuelo, porque depende de los
  // tipos que ese curso tenga cargados.
  if (key.startsWith('tipo:')) {
    const tipo = key.slice(5)
    return {
      key, titulo: 'Encuentros de este tipo', etiqueta: `los encuentros de tipo ${tipo}`,
      icono: 'ti-filter', tono: 'neutral', ayuda: '',
      aplica: s => s.type === tipo,
    }
  }
  return FOCOS.find(f => f.key === key) ?? null
}

/** Cuántos encuentros caen en un foco. */
export function contar(foco: Foco, sessions: ExtendedSession[], hoy: string): number {
  return sessions.filter(s => foco.aplica(s, hoy)).length
}

/** URL del Cronograma mostrando un foco. */
export function urlFoco(courseId: string, key: string): string {
  return `/courses/schedule?c=${encodeURIComponent(courseId)}&${FOCUS_PARAM}=${encodeURIComponent(key)}`
}
