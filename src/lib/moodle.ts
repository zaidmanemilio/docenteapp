// src/lib/moodle.ts
// Lógica compartida del seguimiento de publicación en Moodle.

import type { MoodleChecklist } from '@/types'

export const MOODLE_STATUSES = [
  { value: 'no_iniciado', label: 'No iniciado' },
  { value: 'borrador',    label: 'Borrador' },
  { value: 'publicado',   label: 'Publicado' },
  { value: 'revisado',    label: 'Revisado' },
] as const

// Ítems del checklist. Los 3 primeros son obligatorios para "completo";
// 'otros' es optativo y NO cuenta para la completitud.
export const CHECKLIST_ITEMS: { key: keyof MoodleChecklist; label: string; optional?: boolean }[] = [
  { key: 'etiqueta',     label: 'Etiqueta creada' },
  { key: 'presentacion', label: 'Presentación subida' },
  { key: 'grabacion',    label: 'Link a grabación' },
  { key: 'otros',        label: 'Otros', optional: true },
]

export const EMPTY_CHECKLIST: MoodleChecklist = {
  etiqueta: false, presentacion: false, grabacion: false, otros: false,
}

export function moodleStatusLabel(status?: string): string {
  return MOODLE_STATUSES.find(s => s.value === status)?.label || 'No iniciado'
}

// El checklist está "completo" cuando los 3 obligatorios están tildados.
// 'otros' no influye.
export function isChecklistComplete(cl?: MoodleChecklist): boolean {
  if (!cl) return false
  return Boolean(cl.etiqueta && cl.presentacion && cl.grabacion)
}

// Normaliza un checklist que puede venir incompleto desde la base.
export function normalizeChecklist(cl?: Partial<MoodleChecklist> | null): MoodleChecklist {
  return { ...EMPTY_CHECKLIST, ...(cl || {}) }
}
