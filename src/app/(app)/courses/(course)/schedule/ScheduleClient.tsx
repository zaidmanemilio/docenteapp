'use client'
// src/app/(app)/courses/[courseId]/schedule/page.tsx
// Fix: permisos granulares por curso, no solo por rol global

import React, { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Commission, Profile, AdditionalLink } from '@/types'
import { SESSION_TYPE_LABELS, SESSION_STATUS_LABELS } from '@/types'
import SessionModal, { type ExtendedSession } from '@/components/schedule/SessionModal'
import SessionCard from '@/components/schedule/SessionCard'
import SessionLinks from '@/components/schedule/SessionLinks'
import { TYPE_COLORS, TYPE_BADGE } from '@/components/schedule/SessionCard'
import {
  type CalendarView, ViewSwitch, MonthNav, MonthGrid, fmtMonthLabel,
  filterWeek, weekRangeLabel,
} from '@/components/calendar/CalendarViews'
import { useDialog } from '@/components/ui/Dialog'
import { buscarFoco, FOCUS_PARAM } from '@/lib/session-focus'
import { useRouter, useSearchParams } from 'next/navigation'
import { buildCourseIcs, icsFileName } from '@/lib/ical'

// ─── Tipos y constantes ───────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  dada:         'badge-success',
  pendiente:    'badge-neutral',
  reprogramada: 'badge-warning',
  cancelada:    'badge-danger',
}

const EMPTY_SESSION: Omit<ExtendedSession, 'id' | 'created_at' | 'updated_at'> = {
  course_id: '', class_number: undefined, date: '', title: '',
  type: 'teorica', responsible: '', modality: 'presencial', status: 'pendiente',
  commission_scope: 'all', canva_url: '', partial_file_url: '', additional_links: [],
  guest_bio_url: '', workshop_brief_url: '', shared_notes: '', private_notes: '',
}

function Badge({ text, cls }: { text: string; cls?: string }) {
  return <span className={`badge ${cls || 'badge-neutral'}`}>{text}</span>
}

function fmtDate(d: string) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

// ─── Componente ───────────────────────────────────────────────────────────────

interface ScheduleClientProps {
  courseId: string
  courseName: string
  zoomUrl: string
  timezone: string
  profile: Profile
  coursePermission: string | null
  initialSessions: ExtendedSession[]
  initialCommissions: Commission[]
  initialCourseTeachers: string[]
}

export default function ScheduleClient({
  courseId, courseName, zoomUrl, timezone, profile, coursePermission,
  initialSessions, initialCommissions, initialCourseTeachers,
}: ScheduleClientProps) {
  const supabase = createClient()

  const [sessions,     setSessions]     = useState<ExtendedSession[]>(initialSessions)
  const [commissions]                   = useState<Commission[]>(initialCommissions)
  const [courseTeachers]                = useState<string[]>(initialCourseTeachers)

  // Solo dos filtros. Había cinco (estado, tipo, comisión, modalidad,
  // responsable) y ocupaban tres renglones arriba del contenido: cuatro de
  // ellos filtraban por cosas que ya se ven de un vistazo en cada encuentro,
  // y en un curso de quince clases no hay nada que acotar.
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterResp,   setFilterResp]   = useState('all')

  // Foco: un recorte con nombre que llega por la URL (?f=sin-canva). Es lo
  // que hace que los números del Panel lleven a la lista que los produjo.
  const router = useRouter()
  const searchParams = useSearchParams()
  const foco = buscarFoco(searchParams.get(FOCUS_PARAM))

  function quitarFoco() {
    const p = new URLSearchParams(searchParams.toString())
    p.delete(FOCUS_PARAM)
    router.replace(`/courses/schedule?${p.toString()}`)
  }

  const [editSession,  setEditSession]  = useState<ExtendedSession | null>(null)
  const [isNew,        setIsNew]        = useState(false)
  const [addLinks,     setAddLinks]     = useState<AdditionalLink[]>([])
  const [saving,       setSaving]       = useState(false)

  // Vista activa. Esta pantalla absorbió a la vieja "Agenda": antes eran dos
  // ítems del menú con los mismos datos, y la lista —que es la que se usa— no
  // mostraba links, ni notas, ni el encuentro 0.
  const [view,         setView]         = useState<CalendarView>('list')
  const ahora = new Date()
  const [monthCursor,  setMonthCursor]  = useState({ year: ahora.getFullYear(), month: ahora.getMonth() })
  const [weekRef,      setWeekRef]      = useState(() => new Date())

  const [bulkMode,     setBulkMode]     = useState(false)
  const [selected,     setSelected]     = useState<Set<string>>(new Set())
  const [bulkSaving,   setBulkSaving]   = useState(false)

  const dialog = useDialog()

  // ─── Fetch ───────────────────────────────────────────────────────────────
  // Tras guardar/borrar solo hace falta releer los encuentros: el curso, las
  // comisiones, los docentes y el permiso los resolvió el servidor.
  const load = useCallback(async () => {
    const { data } = await supabase
      .from('sessions')
      .select('*')
      .eq('course_id', courseId)
      .order('date')
      .order('class_number')
    setSessions(data || [])
  }, [courseId, supabase])


  // ─── Permisos efectivos ───────────────────────────────────────────────────
  // canEdit: puede editar encuentros (edit o full en este curso, o admin global)
  const canEdit = coursePermission === 'full' || coursePermission === 'edit'
  // canDelete: solo full o admin
  const isAdmin = profile.global_role === 'admin'
  const canDelete = coursePermission === 'full' || isAdmin

  // Hoy, en ISO. Lo usan el foco, el eje temporal y la marca de "próxima".
  const hoyISO = new Date().toISOString().slice(0, 10)

  // ─── Filtros ──────────────────────────────────────────────────────────────
  const responsables = [...new Set(sessions.map(s => s.responsible))].filter(Boolean)

  const filtered = sessions.filter(s => {
    if (foco && !foco.aplica(s, hoyISO)) return false
    if (filterStatus !== 'all' && s.status !== filterStatus) return false
    if (filterResp   !== 'all' && s.responsible !== filterResp) return false
    return true
  })
  // El encuentro 0 es la ficha del curso y va siempre primero.
  // Antes el orden lo daba la consulta (ORDER BY date), y como la ficha no
  // tiene fecha, Postgres la mandaba al final: los nulos van últimos.
  .sort((a, b) => {
    if (a.class_number === 0) return -1
    if (b.class_number === 0) return 1
    const porFecha = (a.date || '').localeCompare(b.date || '')
    if (porFecha !== 0) return porFecha
    return (a.class_number ?? 0) - (b.class_number ?? 0)
  })

  // ── Eje temporal ──────────────────────────────────────────────────────
  // Un cronograma es tiempo, pero la tabla era una lista plana: sin meses,
  // sin "hoy", sin diferencia entre lo dado y lo que viene.
  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio',
                 'agosto','septiembre','octubre','noviembre','diciembre']
  function etiquetaMes(fecha: string) {
    const [a, m] = fecha.split('-')
    return `${MESES[parseInt(m, 10) - 1]} ${a}`
  }

  // Contadores del encabezado: el encuentro 0 es la ficha del curso, no una
  // clase, así que no entra en el total.
  const clasesReales = sessions.filter(s => s.class_number !== 0)
  const totalClases  = clasesReales.length
  const dictados     = clasesReales.filter(s => s.status === 'dada').length

  // ── Datos para las vistas de calendario ───────────────────────────────
  // El encuentro 0 es la ficha del curso y no tiene fecha: encabeza la agenda
  // pero no puede ubicarse en una semana ni en una grilla mensual.
  const fichaCurso = filtered.find(s => s.class_number === 0) || null
  const conFecha = filtered.filter(
    (s): s is ExtendedSession & { date: string } => !!s.date,
  )

  function porMes(lista: (ExtendedSession & { date: string })[]) {
    const grupos: Record<string, (ExtendedSession & { date: string })[]> = {}
    for (const s of lista) (grupos[s.date.slice(0, 7)] ||= []).push(s)
    return grupos
  }

  const agendaPorMes = porMes(conFecha)
  const semana       = filterWeek(conFecha, weekRef)
  const semanaPorMes = porMes(semana)

  const mesVisible = `${monthCursor.year}-${String(monthCursor.month + 1).padStart(2, '0')}`
  const eventosDelMes = conFecha
    .filter(s => s.date.slice(0, 7) === mesVisible)
    .map(s => ({
      id: s.id as string,
      date: s.date,
      title: s.title,
      color: TYPE_COLORS[s.type] || 'var(--text-muted)',
      time: s.start_time || undefined,
      muted: s.status === 'cancelada',
      flagPast: s.date < hoyISO && s.status === 'pendiente',
    }))

  // La próxima clase: la primera de hoy en adelante.
  const idProxima = conFecha.find(s => s.date >= hoyISO)?.id

  // Horarios que se pisan el mismo día. Ya lo detectaba la Agenda; ahora que
  // es una sola pantalla, el aviso vale para todas las vistas.
  const superpuestos = new Set<string>()
  for (let i = 0; i < conFecha.length; i++) {
    for (let j = i + 1; j < conFecha.length; j++) {
      const a = conFecha[i], b = conFecha[j]
      if (a.date !== b.date) continue
      if (!a.start_time || !b.start_time || !a.end_time || !b.end_time) continue
      if (a.start_time < b.end_time && b.start_time < a.end_time) {
        superpuestos.add(a.id as string)
        superpuestos.add(b.id as string)
      }
    }
  }

  function mesAnterior()  { setMonthCursor(c => c.month === 0  ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }) }
  function mesSiguiente() { setMonthCursor(c => c.month === 11 ? { year: c.year + 1, month: 0  } : { year: c.year, month: c.month + 1 }) }
  function mesHoy()       { const t = new Date(); setMonthCursor({ year: t.getFullYear(), month: t.getMonth() }) }
  function semanaAnterior()  { setWeekRef(r => new Date(r.getFullYear(), r.getMonth(), r.getDate() - 7)) }
  function semanaSiguiente() { setWeekRef(r => new Date(r.getFullYear(), r.getMonth(), r.getDate() + 7)) }
  function semanaHoy()       { setWeekRef(new Date()) }

  /** La grilla mensual devuelve un id; el modal necesita el encuentro. */
  function openEditById(id: string) {
    const s = sessions.find(x => x.id === id)
    if (s) openEdit(s)
  }

  // ─── Handlers modal ───────────────────────────────────────────────────────
  function openAdd() {
    if (!canEdit) return
    setEditSession({
      ...EMPTY_SESSION,
      course_id: courseId,
      commission_scope: commissions.length === 1 ? commissions[0].id : 'all',
    } as ExtendedSession)
    setAddLinks([])
    setIsNew(true)
  }

  function openEdit(s: ExtendedSession) {
    setEditSession({ ...s })
    setAddLinks([...(s.additional_links || [])])
    setIsNew(false)
  }

  function handleClose() { setEditSession(null) }

  async function handleSave() {
    if (!editSession) return
    // Verificar permiso antes de guardar (no solo ocultar botón)
    if (!canEdit) {
      await dialog.alert({ title: 'Sin permiso', message: 'No tenés permiso para editar encuentros en este curso.', tone: 'danger' })
      return
    }
    // El encuentro 0 es la ficha del curso, no una clase: no lleva fecha.
    const esFicha = editSession.class_number === 0
    if (!editSession.title) {
      await dialog.alert({ title: 'Falta el título', message: 'Todo encuentro necesita un título para poder guardarse.' })
      return
    }
    if (!esFicha && !editSession.date) {
      await dialog.alert({ title: 'Falta la fecha', message: 'Solo el encuentro 0 puede quedar sin fecha.' })
      return
    }
    setSaving(true)
    const { id, created_at, updated_at, ...payload } = editSession as ExtendedSession & { created_at: string; updated_at: string }
    // date llega como '' si el campo quedó vacío, y Postgres rechaza ''
    // como fecha. Se normaliza acá además de en el campo, para que ningún
    // camino futuro vuelva a mandar texto vacío.
    const finalPayload = {
      ...payload,
      // La ficha del curso no se dicta: su título es el mismo rótulo en
      // todos los cursos, nunca lleva fecha, y no puede quedar "pendiente"
      // (si no, un curso con todas sus clases dadas no llega al 100% en el
      // Panel, porque la ficha arrastra el conteo).
      title: esFicha ? 'ESTRUCTURA DEL CURSO' : payload.title,
      status: esFicha ? 'dada' : payload.status,
      date: esFicha ? null : (payload.date || null),
      additional_links: addLinks,
      course_id: courseId,
    }

    // Antes el resultado se descartaba: si la base rechazaba el cambio, el
    // modal se cerraba igual y parecía que había guardado.
    const { error } = isNew
      ? await supabase.from('sessions').insert(finalPayload)
      : await supabase.from('sessions')
          .update({ ...finalPayload, updated_at: new Date().toISOString() })
          .eq('id', id)

    setSaving(false)
    if (error) {
      await dialog.alert({ title: 'No se pudo guardar', message: error.message, tone: 'danger' })
      return // el modal queda abierto para no perder lo cargado
    }
    setEditSession(null)
    load()
  }

  // Renumera TODOS los encuentros del curso siguiendo el orden de fecha.
  // Los cursos creados antes de que existiera el encuentro 0 quedaron con la
  // numeración corrida (y a veces con números repetidos), y arreglarlos uno
  // por uno era inviable.
  async function renumerar() {
    if (!canEdit) {
      await dialog.alert({ title: 'Sin permiso', message: 'No tenés permiso para editar encuentros en este curso.', tone: 'danger' })
      return
    }
    const resp = await dialog.prompt({
      title: 'Renumerar por orden de fecha',
      message: 'Elegí con qué número arranca el primero:\n'
        + '0 — el primero es el encuentro 0 (ej. "ESTRUCTURA DEL CURSO")\n'
        + '1 — numeración clásica desde 1',
      label: 'Empezar desde',
      defaultValue: '0',
      inputType: 'number',
      confirmLabel: 'Ver resultado',
    })
    if (resp === null) return
    const desde = parseInt(resp, 10)
    if (Number.isNaN(desde) || desde < 0) {
      await dialog.alert({ title: 'Número inválido', message: 'Ingresá 0 o 1.' })
      return
    }

    // Orden por fecha y, a igual fecha, por hora de inicio.
    const orden = [...sessions].sort((a, b) => {
      const f = (a.date || '').localeCompare(b.date || '')
      if (f !== 0) return f
      return (a.start_time || '').localeCompare(b.start_time || '')
    })

    const preview = orden
      .map((s, i) => `${desde + i}. ${s.title}`)
      .join('\n')
    const ok = await dialog.confirm({
      title: 'Va a quedar así',
      message: preview,
      confirmLabel: `Renumerar ${orden.length} encuentros`,
    })
    if (!ok) return

    setSaving(true)
    const errores: string[] = []
    for (let i = 0; i < orden.length; i++) {
      const { error } = await supabase
        .from('sessions')
        .update({ class_number: desde + i, updated_at: new Date().toISOString() })
        .eq('id', orden[i].id as string)
      if (error) errores.push(`${orden[i].title}: ${error.message}`)
    }
    setSaving(false)

    if (errores.length > 0) {
      await dialog.alert({
        title: `No se pudieron renumerar ${errores.length} encuentro(s)`,
        message: errores.join('\n'),
        tone: 'danger',
      })
    }
    load()
  }

  // Descarga el cronograma como .ics para importar en cualquier calendario.
  // Se excluyen el encuentro 0 (es la ficha del curso, no una clase) y los
  // cancelados. Los horarios se convierten a UTC usando la zona del curso, así
  // el calendario los muestra en la hora local de quien lo importe.
  async function exportarCalendario() {
    const ics = buildCourseIcs(
      sessions.map(s => ({
        id: String(s.id),
        class_number: s.class_number,
        title: s.title,
        date: s.date,
        start_time: s.start_time,
        end_time: s.end_time,
        status: s.status,
        modality: s.modality,
        location: s.location,
        responsible: s.responsible,
      })),
      { courseName, timezone, zoomUrl },
    )

    const cuantos = (ics.match(/BEGIN:VEVENT/g) || []).length
    if (cuantos === 0) {
      await dialog.alert({
        title: 'No hay clases para exportar',
        message: 'Se excluyen el encuentro 0 y los encuentros cancelados.',
      })
      return
    }

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = icsFileName(courseName)
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Aplica el horario del encuentro abierto a TODOS los del curso.
  // Guarda también el actual, así no queda la incoherencia de que los demás
  // cambien y el que estás editando no.
  async function replicarHorario() {
    if (!editSession?.start_time) return
    if (!canEdit) {
      await dialog.alert({ title: 'Sin permiso', message: 'No tenés permiso para editar encuentros en este curso.', tone: 'danger' })
      return
    }
    const ini = editSession.start_time
    const fin = editSession.end_time || ''
    const otros = sessions.filter(s => s.id !== editSession.id)

    const okReplicar = await dialog.confirm({
      title: 'Replicar este horario',
      message: `Se va a poner ${ini}${fin ? ' a ' + fin : ''} en los ${otros.length + 1} `
        + 'encuentros del curso.\n\nDespués podés ajustar los que hagan excepción.',
      confirmLabel: 'Replicar en todos',
    })
    if (!okReplicar) return

    setSaving(true)
    const { error } = await supabase
      .from('sessions')
      .update({ start_time: ini, end_time: fin || null, updated_at: new Date().toISOString() })
      .eq('course_id', courseId)
    setSaving(false)

    if (error) {
      await dialog.alert({ title: 'No se pudo replicar el horario', message: error.message, tone: 'danger' })
      return
    }
    setEditSession(null)
    load()
  }

  async function handleDelete() {
    if (!editSession?.id) return
    // Verificar permiso de borrado
    if (!canDelete) {
      await dialog.alert({ title: 'Sin permiso', message: 'No tenés permiso para eliminar encuentros en este curso.', tone: 'danger' })
      return
    }
    const okBorrar = await dialog.confirm({
      title: 'Eliminar este encuentro',
      message: `"${editSession.title}" se elimina de forma definitiva, junto con sus notas y links.`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    })
    if (!okBorrar) return
    await supabase.from('sessions').delete().eq('id', editSession.id)
    setEditSession(null)
    load()
  }

  // ─── Handlers edición masiva ──────────────────────────────────────────────
  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function selectAll()     { setSelected(new Set(filtered.map(s => s.id as string))) }
  function clearSelection(){ setSelected(new Set()) }

  async function bulkChangeStatus(status: string) {
    if (!selected.size || !canEdit) return
    setBulkSaving(true)
    await supabase.from('sessions').update({ status }).in('id', [...selected])
    setBulkSaving(false)
    clearSelection()
    load()
  }

  async function bulkChangeModality(modality: string) {
    if (!selected.size || !canEdit) return
    setBulkSaving(true)
    await supabase.from('sessions').update({ modality }).in('id', [...selected])
    setBulkSaving(false)
    clearSelection()
    load()
  }

  async function bulkChangeResponsible() {
    if (!canEdit) return
    const resp = await dialog.prompt({
      title: 'Cambiar responsable',
      message: `Se aplica a los ${selected.size} encuentros seleccionados.`,
      label: 'Responsable',
      placeholder: 'Nombre y apellido',
    })
    if (!resp) return
    setBulkSaving(true)
    await supabase.from('sessions').update({ responsible: resp }).in('id', [...selected])
    setBulkSaving(false)
    clearSelection()
    load()
  }

  async function bulkDelete() {
    if (!selected.size || !canDelete) return
    const okBulk = await dialog.confirm({
      title: `Eliminar ${selected.size} encuentro${selected.size > 1 ? 's' : ''}`,
      message: 'Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
      tone: 'danger',
    })
    if (!okBulk) return
    setBulkSaving(true)
    await supabase.from('sessions').delete().in('id', [...selected])
    setBulkSaving(false)
    setBulkMode(false)
    clearSelection()
    load()
  }


  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-4)', flexWrap: 'wrap', marginBottom: 'var(--space-6)' }}>
        <div className="page-head" style={{ marginBottom: 0 }}>
          <h2 className="page-title">Cronograma</h2>
          {/* Línea de información real en vez del copete con el nombre del
              curso. De paso da el contador de resultados que la app no
              tenía: cuántos encuentros hay y cuántos se dictaron. */}
          <p className="page-meta">
            {courseName} · <strong>{totalClases}</strong> {totalClases === 1 ? 'encuentro' : 'encuentros'}
            {dictados > 0 && <> · <strong>{dictados}</strong> {dictados === 1 ? 'dado' : 'dados'}</>}
            {filtered.length !== sessions.length && <> · mostrando <strong>{filtered.length}</strong></>}
          </p>
        </div>
        <div className="filter-row">
          {canEdit && (
            <button onClick={() => {
              // En la grilla mensual no hay dónde poner las casillas, así que
              // activar edición masiva lleva a la agenda en vez de no hacer nada.
              if (!bulkMode && view === 'month') setView('list')
              setBulkMode(!bulkMode)
              clearSelection()
            }} style={{
              padding: '7px 14px',
              background: bulkMode ? 'var(--chip-accent-bg)' : 'var(--surface)',
              border: `1px solid ${bulkMode ? 'var(--accent)' : 'var(--border)'}`,
              color: bulkMode ? 'var(--chip-accent-fg)' : 'var(--text-muted)',
              borderRadius: '8px', fontSize: '13px',
              fontWeight: bulkMode ? 600 : 400,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              <i className="ti ti-list-check" aria-hidden="true"></i>
              {bulkMode ? 'Salir de edición masiva' : 'Edición masiva'}
            </button>
          )}
          <button onClick={exportarCalendario} title="Descargar el cronograma para importar en tu calendario" style={{
            padding: '7px 14px', background: 'var(--surface)',
            border: '1px solid var(--border)', color: 'var(--text-secondary)',
            borderRadius: '8px', fontSize: '13px',
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <i className="ti ti-calendar-plus" aria-hidden="true"></i>
            Exportar al calendario
          </button>
          {canEdit && (
            <button onClick={renumerar} title="Renumerar los encuentros por orden de fecha" style={{
              padding: '7px 14px', background: 'var(--surface)',
              border: '1px solid var(--border)', color: 'var(--text-secondary)',
              borderRadius: '8px', fontSize: '13px',
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              <i className="ti ti-sort-ascending-numbers" aria-hidden="true"></i>
              Renumerar
            </button>
          )}
          {canEdit && (
            <button onClick={openAdd} style={{
              padding: '7px 16px', background: 'var(--accent-solid)', color: 'white',
              border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              <i className="ti ti-plus" aria-hidden="true"></i> Agregar clase
            </button>
          )}
        </div>
      </div>

      {/* Barra edición masiva.
          Era un bloque índigo casi negro con todos los colores escritos a
          mano: en el tema claro quedaba como una mancha oscura en medio de
          la página. Ahora usa los tokens y las clases de botón de siempre. */}
      {bulkMode && (
        <div className="bulk-bar">
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--chip-accent-fg)' }}>
            {selected.size} seleccionada{selected.size !== 1 ? 's' : ''}
          </span>
          <button className="bulk-link" onClick={selectAll}>Seleccionar todas</button>
          <button className="bulk-link" onClick={clearSelection}>Limpiar</button>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <select className="bulk-control" aria-label="Cambiar estado de lo seleccionado"
              onChange={e => e.target.value && bulkChangeStatus(e.target.value)} defaultValue=""
              disabled={!selected.size || bulkSaving}>
              <option value="">Cambiar estado…</option>
              <option value="pendiente">Pendiente</option>
              <option value="dada">Dada</option>
              <option value="reprogramada">Reprogramada</option>
              <option value="cancelada">Cancelada</option>
            </select>
            <select className="bulk-control" aria-label="Cambiar modalidad de lo seleccionado"
              onChange={e => e.target.value && bulkChangeModality(e.target.value)} defaultValue=""
              disabled={!selected.size || bulkSaving}>
              <option value="">Cambiar modalidad…</option>
              <option value="presencial">Presencial</option>
              <option value="virtual">Virtual</option>
            </select>
            <button className="bulk-control" onClick={bulkChangeResponsible} disabled={!selected.size || bulkSaving}>
              Cambiar responsable
            </button>
            {canDelete && (
              <button className="bulk-control is-danger" onClick={bulkDelete} disabled={!selected.size || bulkSaving}>
                <i className="ti ti-trash" aria-hidden="true"></i> Eliminar
              </button>
            )}
          </div>
        </div>
      )}

      {/* Foco activo: de dónde viniste y cómo volver a ver todo. */}
      {foco && (
        <div className="focus-chip">
          <i className={`ti ${foco.icono}`} aria-hidden="true"></i>
          <span>
            Mostrando <strong>{foco.etiqueta}</strong> · {filtered.length} de {sessions.length}
          </span>
          <button onClick={quitarFoco}>
            <i className="ti ti-x" aria-hidden="true"></i> Ver todos
          </button>
        </div>
      )}

      {/* Filtros */}
      <div className="filter-row" style={{ marginBottom: 'var(--space-4)', alignItems: 'center' }}>
        <span className="filter-label">Estado</span>
        {[['all','Todas'],['pendiente','Pendiente'],['dada','Dada'],['reprogramada','Reprog.'],['cancelada','Cancelada']].map(([v, l]) => (
          <button key={v} className={`filter-pill${filterStatus === v ? ' active' : ''}`}
            aria-pressed={filterStatus === v}
            onClick={() => setFilterStatus(v)}>{l}</button>
        ))}

        {responsables.length > 1 && (
          <>
            <span className="filter-label" style={{ marginLeft: 'var(--space-3)' }}>Responsable</span>
            <select value={filterResp} onChange={e => setFilterResp(e.target.value)}
              aria-label="Filtrar por responsable del dictado"
              style={{ padding: '5px 10px', borderRadius: '99px', fontSize: 'var(--text-xs)', border: '1px solid var(--input-border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontFamily: 'inherit', cursor: 'pointer' }}>
              <option value="all">Todos</option>
              {responsables.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </>
        )}
      </div>

      {/* Barra de vista: cómo se mira el mismo cronograma. */}
      <div className="view-bar">
        <ViewSwitch value={view} onChange={setView} options={['list', 'week', 'month', 'table']} />
        {view === 'month' && (
          <MonthNav label={fmtMonthLabel(monthCursor.year, monthCursor.month)}
            onPrev={mesAnterior} onNext={mesSiguiente} onToday={mesHoy} />
        )}
        {view === 'week' && (
          <MonthNav label={weekRangeLabel(weekRef)}
            onPrev={semanaAnterior} onNext={semanaSiguiente} onToday={semanaHoy} />
        )}
        {zoomUrl && (
          <a href={zoomUrl} target="_blank" rel="noopener noreferrer"
            className="btn btn-ghost view-bar-end" style={{ textDecoration: 'none' }}>
            <i className="ti ti-video" aria-hidden="true"></i>
            Zoom del curso
          </a>
        )}
      </div>

      {superpuestos.size > 0 && (
        <div className="alert alert-warning" style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <i className="ti ti-alert-triangle" aria-hidden="true"></i>
          <span>Hay encuentros que se pisan en el mismo día y horario. Están marcados.</span>
        </div>
      )}

      {/* ── Vacío ── */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
          <i className="ti ti-calendar-off" style={{ fontSize: '40px', opacity: 0.4, display: 'block', marginBottom: '12px' }} aria-hidden="true"></i>
          <p>No hay encuentros con los filtros seleccionados.</p>
        </div>

      /* ── Vista Mes ── */
      ) : view === 'month' ? (
        eventosDelMes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
            <i className="ti ti-calendar-off" style={{ fontSize: '40px', opacity: 0.4, display: 'block', marginBottom: '12px' }} aria-hidden="true"></i>
            <p>Sin encuentros en {fmtMonthLabel(monthCursor.year, monthCursor.month).toLowerCase()}.</p>
          </div>
        ) : (
          <MonthGrid year={monthCursor.year} month0={monthCursor.month}
            events={eventosDelMes} today={hoyISO} onEventClick={openEditById} />
        )

      /* ── Vistas Agenda y Semana ── */
      ) : view !== 'table' ? (
        (() => {
          const grupos = view === 'week' ? semanaPorMes : agendaPorMes
          // La ficha del curso encabeza la agenda completa; en una semana
          // concreta no tiene sentido, porque no tiene fecha.
          const ficha = view === 'list' ? fichaCurso : null
          if (Object.keys(grupos).length === 0 && !ficha) {
            return (
              <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                <i className="ti ti-calendar-off" style={{ fontSize: '40px', opacity: 0.4, display: 'block', marginBottom: '12px' }} aria-hidden="true"></i>
                <p>{view === 'week' ? 'Sin encuentros esta semana.' : 'Sin encuentros para mostrar.'}</p>
              </div>
            )
          }
          return (
            <>
              {ficha && (
                <div style={{ marginBottom: 'var(--space-6)' }}>
                  <SessionCard
                    session={ficha}
                    commissions={commissions}
                    zoomUrl={zoomUrl}
                    hoy={hoyISO}
                    canEdit={canEdit}
                    onOpen={() => openEdit(ficha)}
                    bulkMode={bulkMode}
                    seleccionada={selected.has(ficha.id as string)}
                    onToggleSelect={() => toggleSelect(ficha.id as string)}
                  />
                </div>
              )}
              {Object.entries(grupos).map(([mes, encuentros]) => (
                <div key={mes} style={{ marginBottom: 'var(--space-6)' }}>
                  <h3 className="month-head">{etiquetaMes(`${mes}-01`)}</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    {encuentros.map(s => (
                      <SessionCard
                        key={s.id}
                        session={s}
                        commissions={commissions}
                        zoomUrl={zoomUrl}
                        hoy={hoyISO}
                        esProxima={s.id === idProxima}
                        esSuperpuesta={superpuestos.has(s.id as string)}
                        canEdit={canEdit}
                        onOpen={() => openEdit(s)}
                        bulkMode={bulkMode}
                        seleccionada={selected.has(s.id as string)}
                        onToggleSelect={() => toggleSelect(s.id as string)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </>
          )
        })()

      /* ── Vista Tabla ── */
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
          <div className="table-scroll">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--hover-bg)' }}>
                  {bulkMode && <th style={{ width: '36px', padding: '8px 12px', borderBottom: '1px solid var(--border)' }}></th>}
                  {['#','Fecha','Clase','Tipo','Responsable','Modalidad',...(commissions.length>1?['Comisión']:[]),'Estado','Links','Ver'].map((h, i) => (
                    <th key={i} style={{ textAlign: 'left', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // La próxima es la primera con fecha de hoy en adelante.
                  const idxProxima = filtered.findIndex(x => x.date && x.date >= hoyISO)
                  let mesPrevio = ''
                  return filtered.map((s, idx) => {
                  const com = commissions.find(c => c.id === s.commission_scope)
                  const esProxima = idx === idxProxima
                  const esPasada  = !!s.date && s.date < hoyISO
                  const mes       = s.date ? etiquetaMes(s.date) : ''
                  const abreMes   = !!mes && mes !== mesPrevio
                  if (mes) mesPrevio = mes
                  const hasReview  = s.review_what_worked || s.review_what_didnt || s.review_change_next

                  return (
                    <React.Fragment key={s.id}>
                    {abreMes && (
                      <tr className="month-row">
                        <th colSpan={99} scope="colgroup">{mes}</th>
                      </tr>
                    )}
                    <tr
                      className={`session-row${esPasada ? ' is-past' : ''}${esProxima ? ' is-next' : ''}`}
                      style={{ borderBottom: '1px solid var(--border)', background: selected.has(s.id as string) ? 'var(--chip-accent-bg)' : 'var(--surface)' }}
                    >
                      {bulkMode && (
                        <td style={{ padding: '10px 12px' }}>
                          <input type="checkbox" checked={selected.has(s.id as string)}
                            onChange={() => toggleSelect(s.id as string)}
                            style={{ width: '15px', height: '15px', cursor: 'pointer' }} />
                        </td>
                      )}
                      <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{s.class_number}</td>
                      <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{s.date ? fmtDate(s.date) : '—'}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 500 }}>{s.title}</div>
                        <div style={{ display: 'flex', gap: '4px', marginTop: '3px', flexWrap: 'wrap' }}>
                          {s.shared_notes && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>📝 notas</span>}
                          {hasReview && <span style={{ fontSize: '10px', color: 'var(--success)' }}>✅ review</span>}
                          {s.status === 'dada' && !hasReview && <span style={{ fontSize: '10px', color: 'var(--warning)' }}>⚠ sin review</span>}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px' }}><Badge text={SESSION_TYPE_LABELS[s.type] || s.type} cls={TYPE_BADGE[s.type]} /></td>
                      <td style={{ padding: '10px 12px', fontSize: '12px' }}>{s.responsible}</td>
                      <td style={{ padding: '10px 12px' }}><Badge text={s.modality === 'presencial' ? '🏫 Pres.' : '💻 Virt.'} /></td>
                      {commissions.length > 1 && (
                        <td style={{ padding: '10px 12px' }}>
                          {s.commission_scope === 'all'
                            ? <Badge text="Todas" cls="badge-info" />
                            : <Badge text={com?.name || s.commission_scope} cls="badge-success" />}
                        </td>
                      )}
                      <td style={{ padding: '10px 12px' }}><Badge text={SESSION_STATUS_LABELS[s.status] || s.status} cls={STATUS_BADGE[s.status]} /></td>
                      <td style={{ padding: '10px 12px' }}>
                        <SessionLinks session={s} zoomUrl={zoomUrl} huecos />
                      </td>
                      <td style={{ padding: '10px 12px' }}>
  <button onClick={() => openEdit(s)}
    title="Ver y editar clase"
    style={{ background: 'var(--accent-solid)', border: 'none', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', color: 'white', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
    <i className="ti ti-player-play-filled" aria-hidden="true"></i>
  </button>
                      </td>
                    </tr>
                    </React.Fragment>
                  )
                  })
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {editSession && (
        <SessionModal
          session={editSession}
          isNew={isNew}
          commissions={commissions}
          teachers={courseTeachers}
          addLinks={addLinks}
          canEdit={canEdit}
          onReplicateTime={replicarHorario}
          isAdmin={canDelete}
          saving={saving}
          onClose={handleClose}
          onSave={handleSave}
          onDelete={handleDelete}
          onSessionChange={setEditSession}
          onAddLinksChange={setAddLinks}
        />
      )}
    </div>
  )
}
