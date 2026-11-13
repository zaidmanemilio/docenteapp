'use client'
// src/components/schedule/GeneradorCronograma.tsx
//
// Carga el cronograma de un curso de una vez: "martes, jueves y viernes
// durante dos semanas". Está armado como la programación de una reunión
// recurrente de Zoom, que es el modelo mental que ya tiene cualquiera.
//
// Antes, para arrancar un curso había que importar un CSV que ya tuvieras
// hecho, o dar de alta los encuentros de a uno. Si ya sabés los días —que
// es lo normal al abrir un curso— las dos cosas son trabajo de más.
//
// El cálculo de fechas vive aparte, en lib/recurrencia.ts, y se prueba
// solo: es donde se esconden los errores de huso horario y de fin de mes.
import { useMemo, useState } from 'react'
import type { Commission, SessionModality } from '@/types'
import type { ExtendedSession } from './SessionModal'
import { useEscape } from '@/lib/use-escape'
import {
  generarFechas, describir, diaSemanaDe, DIAS_CORTOS, DIAS_LARGOS,
  type DiaSemana, type Frecuencia,
} from '@/lib/recurrencia'

const HOY = () => new Date().toISOString().slice(0, 10)

/** 'YYYY-MM-DD' → 'mar 2/3' */
function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${DIAS_CORTOS[diaSemanaDe(iso)].toLowerCase()} ${parseInt(d, 10)}/${parseInt(m, 10)}/${a.slice(2)}`
}

export type NuevaSesion = Omit<ExtendedSession, 'id' | 'created_at' | 'updated_at'>

interface Props {
  courseId: string
  commissions: Commission[]
  teachers: string[]
  /** Modalidad del curso: se usa como valor inicial. */
  modalidadCurso?: string
  /** Número con el que arranca la numeración (máximo existente + 1). */
  numeroInicial: number
  /** Fechas que ya tienen un encuentro, para avisar de la superposición. */
  fechasExistentes: string[]
  onClose: () => void
  onConfirmar: (filas: NuevaSesion[]) => Promise<void>
}

export default function GeneradorCronograma({
  courseId, commissions, teachers, modalidadCurso,
  numeroInicial, fechasExistentes, onClose, onConfirmar,
}: Props) {
  const [desde, setDesde] = useState(HOY)
  const [frecuencia, setFrecuencia] = useState<Frecuencia>('semanal')
  const [cada, setCada] = useState(1)

  // Mientras no toques los días, se usa el de la fecha de inicio: elegís
  // "empieza el martes 2" y ya quedan marcados los martes.
  //
  // "Tocados" y la lista viven en UN solo estado a propósito. Separados, dos
  // clics seguidos se pisaban: el segundo leía el "tocados" viejo, volvía a
  // partir del día de la fecha de inicio y borraba el primero. Con un único
  // objeto y actualización funcional, el orden ya no importa.
  const [diasState, setDiasState] = useState<{ tocados: boolean; dias: DiaSemana[] }>(
    { tocados: false, dias: [] },
  )
  const dias = diasState.tocados ? diasState.dias : [diaSemanaDe(desde)]

  const [finTipo, setFinTipo] = useState<'cantidad' | 'fecha'>('cantidad')
  const [cantidad, setCantidad] = useState(8)
  const [hasta, setHasta] = useState('')

  const [horaIni, setHoraIni] = useState('')
  const [horaFin, setHoraFin] = useState('')
  const [titulo, setTitulo] = useState('A definir')
  const [modalidad, setModalidad] = useState<SessionModality>(
    (modalidadCurso === 'virtual' ? 'virtual' : 'presencial') as SessionModality,
  )
  const [responsable, setResponsable] = useState('')
  const [comision, setComision] = useState(commissions.length === 1 ? commissions[0].id : 'all')

  // Ajustes sobre lo generado: fechas sacadas y fechas agregadas a mano.
  const [quitadas, setQuitadas] = useState<string[]>([])
  const [sueltas, setSueltas] = useState<string[]>([])
  const [fechaSuelta, setFechaSuelta] = useState('')

  const [creando, setCreando] = useState(false)
  useEscape(onClose, !creando)

  const recurrencia = useMemo(() => ({
    desde, frecuencia, cada, dias,
    fin: finTipo === 'cantidad'
      ? { tipo: 'cantidad' as const, cantidad }
      : { tipo: 'fecha' as const, hasta },
  }), [desde, frecuencia, cada, dias, finTipo, cantidad, hasta])

  const generadas = useMemo(() => generarFechas(recurrencia), [recurrencia])

  /** Lo que se va a crear: lo generado menos lo quitado, más lo suelto. */
  const finales = useMemo(() => {
    const fuera = new Set(quitadas)
    return [...new Set([...generadas.filter(f => !fuera.has(f)), ...sueltas])].sort()
  }, [generadas, quitadas, sueltas])

  const yaExisten = useMemo(() => new Set(fechasExistentes), [fechasExistentes])
  const repetidas = finales.filter(f => yaExisten.has(f)).length

  function alternarDia(d: DiaSemana) {
    setDiasState(prev => {
      const base = prev.tocados ? prev.dias : [diaSemanaDe(desde)]
      return {
        tocados: true,
        dias: base.includes(d) ? base.filter(x => x !== d) : [...base, d],
      }
    })
  }

  function agregarSuelta() {
    if (!fechaSuelta) return
    setSueltas(s => [...new Set([...s, fechaSuelta])])
    setQuitadas(q => q.filter(f => f !== fechaSuelta))
    setFechaSuelta('')
  }

  async function confirmar() {
    if (finales.length === 0 || creando) return
    setCreando(true)
    const filas: NuevaSesion[] = finales.map((fecha, i) => ({
      course_id: courseId,
      class_number: numeroInicial + i,
      date: fecha,
      title: titulo.trim() || 'A definir',
      type: 'teorica',
      responsible: responsable,
      modality: modalidad,
      status: 'pendiente',
      commission_scope: comision,
      start_time: horaIni || undefined,
      end_time: horaFin || undefined,
      canva_url: '', partial_file_url: '', guest_bio_url: '', workshop_brief_url: '',
      shared_notes: '', private_notes: '',
      additional_links: [],
    })) as NuevaSesion[]
    try {
      await onConfirmar(filas)
    } finally {
      setCreando(false)
    }
  }

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '20px',
      }}
    >
      <div className="modal-panel" role="dialog" aria-modal="true" aria-label="Generar cronograma"
        style={{
          background: 'var(--surface)', borderRadius: '12px',
          width: '620px', maxWidth: '100%', maxHeight: '92dvh', overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}>

        <div className="modal-head" style={{ padding: 'var(--space-4) var(--space-6)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <h3 style={{ flex: 1, margin: 0, fontSize: 'var(--text-lg)', fontWeight: 600, letterSpacing: '-.01em' }}>
            Generar cronograma
          </h3>
          <button className="modal-close" onClick={onClose} disabled={creando}
            aria-label="Cerrar" title="Cerrar (Esc)">
            <i className="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>

        <div style={{ padding: 'var(--space-6)' }}>

          {/* ── Cuándo arranca y a qué hora ── */}
          <div className="field-grid">
            <div className="field">
              <label className="field-label" htmlFor="gen-desde">Primer encuentro</label>
              <input id="gen-desde" className="field-input" type="date"
                value={desde} onChange={e => setDesde(e.target.value || HOY())} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="gen-hi">Hora de inicio</label>
              <input id="gen-hi" className="field-input" type="time"
                value={horaIni} onChange={e => setHoraIni(e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="gen-hf">Hora de fin</label>
              <input id="gen-hf" className="field-input" type="time"
                value={horaFin} onChange={e => setHoraFin(e.target.value)} />
            </div>
          </div>

          {/* ── Cada cuánto ── */}
          <div className="field">
            <label className="field-label" htmlFor="gen-frec">Se repite</label>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
              <select id="gen-frec" className="field-input" style={{ width: 'auto', minWidth: '150px' }}
                value={frecuencia} onChange={e => setFrecuencia(e.target.value as Frecuencia)}>
                <option value="diaria">Todos los días</option>
                <option value="semanal">Cada semana</option>
                <option value="mensual">Cada mes</option>
              </select>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>cada</span>
              <input className="field-input" type="number" min={1} max={12} style={{ width: '80px' }}
                aria-label="Cada cuántos períodos se repite"
                value={cada} onChange={e => setCada(Math.max(1, parseInt(e.target.value, 10) || 1))} />
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                {frecuencia === 'diaria' ? 'día(s)' : frecuencia === 'semanal' ? 'semana(s)' : 'mes(es)'}
              </span>
            </div>
          </div>

          {frecuencia === 'semanal' && (
            <div className="field">
              <span className="field-label">Días de la semana</span>
              <div className="day-row">
                {DIAS_CORTOS.map((nombre, i) => (
                  <button key={nombre} type="button" className="day-toggle"
                    aria-pressed={dias.includes(i as DiaSemana)}
                    aria-label={DIAS_LARGOS[i]}
                    onClick={() => alternarDia(i as DiaSemana)}>
                    {nombre}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Hasta cuándo ── */}
          <div className="field">
            <span className="field-label">Termina</span>
            <div className="radio-row">
              <label htmlFor="fin-cant">
                <input id="fin-cant" type="radio" name="fin" checked={finTipo === 'cantidad'}
                  onChange={() => setFinTipo('cantidad')} />
                Después de
              </label>
              <input className="field-input" type="number" min={1} max={400} style={{ width: '90px' }}
                aria-label="Cantidad de encuentros"
                disabled={finTipo !== 'cantidad'}
                value={cantidad} onChange={e => setCantidad(Math.max(1, parseInt(e.target.value, 10) || 1))} />
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>encuentros</span>
            </div>
            <div className="radio-row">
              <label htmlFor="fin-fecha">
                <input id="fin-fecha" type="radio" name="fin" checked={finTipo === 'fecha'}
                  onChange={() => setFinTipo('fecha')} />
                El día
              </label>
              <input className="field-input" type="date" style={{ width: 'auto' }}
                aria-label="Último día"
                disabled={finTipo !== 'fecha'}
                value={hasta} onChange={e => setHasta(e.target.value)} />
            </div>
          </div>

          {/* ── Qué se carga en cada encuentro ── */}
          <div className="field-grid">
            <div className="field">
              <label className="field-label" htmlFor="gen-titulo">Título de cada encuentro</label>
              <input id="gen-titulo" className="field-input" value={titulo}
                onChange={e => setTitulo(e.target.value)} placeholder="A definir" />
              <p className="field-help">Después los editás uno por uno desde el cronograma.</p>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="gen-mod">Modalidad</label>
              <select id="gen-mod" className="field-input" value={modalidad}
                onChange={e => setModalidad(e.target.value as SessionModality)}>
                <option value="presencial">Presencial</option>
                <option value="virtual">Virtual</option>
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="gen-resp">Responsable</label>
              <select id="gen-resp" className="field-input" value={responsable}
                onChange={e => setResponsable(e.target.value)}>
                <option value="">— Sin asignar —</option>
                {teachers.map(t => <option key={t} value={t}>{t}</option>)}
                <option value="Invitado/a">Invitado/a</option>
              </select>
            </div>
            {commissions.length > 1 && (
              <div className="field">
                <label className="field-label" htmlFor="gen-com">Comisión</label>
                <select id="gen-com" className="field-input" value={comision}
                  onChange={e => setComision(e.target.value)}>
                  <option value="all">Todas las comisiones</option>
                  {commissions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* ── Qué va a quedar ── */}
          <div className="field" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <span className="field-label" style={{ marginBottom: 0 }}>
                Van a crearse {finales.length} {finales.length === 1 ? 'encuentro' : 'encuentros'}
              </span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                {describir(recurrencia)}
              </span>
            </div>

            {repetidas > 0 && (
              <div className="alert alert-warning" style={{ margin: 'var(--space-2) 0 0', padding: 'var(--space-2) var(--space-3)', borderRadius: '8px', fontSize: 'var(--text-xs)' }}>
                {repetidas === 1
                  ? 'Un día ya tiene otro encuentro cargado. Está marcado abajo.'
                  : `${repetidas} días ya tienen otro encuentro cargado. Están marcados abajo.`}
              </div>
            )}

            <div className="gen-preview" style={{ marginTop: 'var(--space-2)' }}>
              {finales.length === 0 ? (
                <p style={{ margin: 0, padding: 'var(--space-6)', textAlign: 'center', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                  {frecuencia === 'semanal' && dias.length === 0
                    ? 'Elegí al menos un día de la semana.'
                    : 'Todavía no hay fechas para crear.'}
                </p>
              ) : (
                finales.map((f, i) => (
                  <div key={f} className="gen-fila">
                    <span className="gen-num">{numeroInicial + i}</span>
                    <span className="gen-fecha">
                      {fechaCorta(f)}
                      {horaIni && <span className="gen-dia"> · {horaIni}{horaFin ? `–${horaFin}` : ''}</span>}
                      {yaExisten.has(f) && (
                        <span className="badge badge-warning" style={{ marginLeft: 'var(--space-2)' }}>
                          ya hay uno ese día
                        </span>
                      )}
                      {sueltas.includes(f) && (
                        <span className="badge badge-info" style={{ marginLeft: 'var(--space-2)' }}>
                          agregado a mano
                        </span>
                      )}
                    </span>
                    <button className="row-danger" title="Sacar esta fecha"
                      aria-label={`Sacar el encuentro del ${fechaCorta(f)}`}
                      onClick={() => {
                        setSueltas(s => s.filter(x => x !== f))
                        setQuitadas(q => [...new Set([...q, f])])
                      }}>
                      <i className="ti ti-x" aria-hidden="true"></i>
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Sumar una fecha que se sale de la regla: el típico "y después
                un jueves dos semanas más tarde". */}
            <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
              <label className="field-label" htmlFor="gen-suelta" style={{ marginBottom: 0 }}>
                Sumar una fecha suelta
              </label>
              <input id="gen-suelta" className="field-input" type="date" style={{ width: 'auto' }}
                value={fechaSuelta} onChange={e => setFechaSuelta(e.target.value)} />
              <button className="btn btn-ghost" onClick={agregarSuelta} disabled={!fechaSuelta}>
                <i className="ti ti-plus" aria-hidden="true"></i> Agregar
              </button>
              {quitadas.length > 0 && (
                <button className="btn btn-ghost" onClick={() => setQuitadas([])}>
                  Restaurar las {quitadas.length} que saqué
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose} disabled={creando}>Cancelar</button>
          <button className="btn btn-primary" onClick={confirmar}
            disabled={creando || finales.length === 0}
            style={{ cursor: creando ? 'wait' : 'pointer' }}>
            {creando
              ? 'Creando…'
              : `Crear ${finales.length} ${finales.length === 1 ? 'encuentro' : 'encuentros'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
