'use client'
// src/app/(app)/courses/[courseId]/import/page.tsx

import { useState, useCallback } from 'react'
import { useCourseId } from '@/lib/use-course'
import { createClient } from '@/lib/supabase/client'
import type { SessionType, SessionModality, SessionStatus } from '@/types'
import { readCsvFile } from '@/lib/csv-encoding'
import { useDialog } from '@/components/ui/Dialog'

const FIELD_DEFS = [
  { key: 'date',            label: 'Fecha',          required: true },
  { key: 'class_number',    label: 'Nº de clase',    required: false },
  { key: 'title',           label: 'Título',         required: true },
  { key: 'type',            label: 'Tipo',           required: true },
  { key: 'responsible',     label: 'Responsable',    required: true },
  { key: 'modality',        label: 'Modalidad',      required: false },
  { key: 'status',          label: 'Estado',         required: false },
  { key: 'commission_scope',label: 'Comisión',       required: false },
  { key: 'canva_url',       label: 'Link Canva',     required: false },
  { key: 'partial_file_url',label: 'Link Parcial',   required: false },
  { key: 'shared_notes',    label: 'Notas',          required: false },
]

const MAP_HINTS: Record<string, string[]> = {
  date:             ['fecha','date','día','dia'],
  class_number:     ['numero_clase','num','class_number','clase','nro','número'],
  title:            ['titulo','title','nombre','clase','descripcion'],
  type:             ['tipo','type'],
  responsible:      ['responsable','responsible','docente','profesor'],
  modality:         ['modalidad','modality'],
  status:           ['estado','status'],
  commission_scope: ['comision','commission','comisión','alcance'],
  canva_url:        ['canva','link_canva','presentacion','presentación'],
  partial_file_url: ['parcial','link_parcial','archivo_parcial'],
  shared_notes:     ['notas','notes','comentarios'],
}

const TYPE_MAP: Record<string, string> = {
  'teórica':'teorica', 'teorica':'teorica', 'práctica':'practica', 'practica':'practica',
  'taller':'taller', 'invitado':'invitado', 'parcial':'parcial',
  'recuperatorio':'recuperatorio', 'exposición':'exposicion', 'exposicion':'exposicion',
  'proyecto':'proyecto',
}
const MODAL_MAP: Record<string, string> = {
  'presencial':'presencial', 'virtual':'virtual', 'online':'virtual', 'remoto':'virtual',
}
const STATUS_MAP: Record<string, string> = {
  'pendiente':'pendiente', 'dada':'dada', 'reprogramada':'reprogramada', 'cancelada':'cancelada',
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (!lines.length) return []
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = vals[i] || '' })
    return obj
  })
}

interface PreviewRow {
  [key: string]: string | string[]
  _errors: string[]
}

export default function ImportPage() {
  const courseId = useCourseId()
  const supabase = createClient()
  const dialog = useDialog()

  const [step, setStep] = useState(1)
  const [rawData, setRawData] = useState<Record<string, string>[]>([])
  const [columns, setColumns] = useState<string[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<PreviewRow[]>([])
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [importedCount, setImportedCount] = useState(0)
  const [commissionScope, setCommissionScope] = useState('all')

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)

    if (file.name.endsWith('.csv') || file.name.endsWith('.txt')) {
      readCsvFile(file).then(text => {   // detecta UTF-8 o Windows-1252
        const data = parseCSV(text)
        const cols = data[0] ? Object.keys(data[0]) : []
        setRawData(data)
        setColumns(cols)
        const autoMap: Record<string, string> = {}
        Object.entries(MAP_HINTS).forEach(([field, hints]) => {
          const found = cols.find(c => hints.some(h => c.toLowerCase().includes(h)))
          if (found) autoMap[field] = found
        })
        setMapping(autoMap)
      })
    } else {
      // XLSX — load dynamically
      import('xlsx').then(XLSX => {
        const reader = new FileReader()
        reader.onload = ev => {
          const wb = XLSX.read(ev.target?.result, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const data: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: '' })
          const cols = data[0] ? Object.keys(data[0]) : []
          setRawData(data.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)]))))
          setColumns(cols)
          const autoMap: Record<string, string> = {}
          Object.entries(MAP_HINTS).forEach(([field, hints]) => {
            const found = cols.find(c => hints.some(h => String(c).toLowerCase().includes(h)))
            if (found) autoMap[field] = found
          })
          setMapping(autoMap)
        }
        reader.readAsArrayBuffer(file)
      })
    }
  }, [])

  function buildPreview() {
    const rows: PreviewRow[] = rawData.map(row => {
      const r: PreviewRow = { _errors: [] }
      FIELD_DEFS.forEach(f => {
        const col = mapping[f.key]
        r[f.key] = col ? (row[col] || '') : ''
      })
      if (!r.date) r._errors.push('Falta fecha')
      if (!r.title) r._errors.push('Falta título')
      if (!r.type) r._errors.push('Falta tipo')
      if (!r.responsible) r._errors.push('Falta responsable')
      if (!r.status) r.status = 'pendiente'
      if (!r.modality) r.modality = 'presencial'
      if (!r.commission_scope) r.commission_scope = commissionScope
      return r
    })
    setPreview(rows)
    setStep(3)
  }

  async function confirmImport() {
    setImporting(true)
    const { data: comms } = await supabase.from('commissions').select('id').eq('course_id', courseId)
    const firstCommId = comms?.[0]?.id || null

const toInsert = preview.filter(r => !r._errors.length).map(r => ({
  course_id: courseId,
  class_number: r.class_number ? parseInt(String(r.class_number)) : null,
  date: String(r.date),
  title: String(r.title),
  type: (TYPE_MAP[String(r.type)?.toLowerCase()] || 'teorica') as SessionType,
  responsible: String(r.responsible),
  modality: (MODAL_MAP[String(r.modality)?.toLowerCase()] || 'presencial') as SessionModality,
  status: (STATUS_MAP[String(r.status)?.toLowerCase()] || 'pendiente') as SessionStatus,
  commission_scope: r.commission_scope === 'all' ? 'all' : (firstCommId || 'all'),
  canva_url: String(r.canva_url || ''),
  partial_file_url: String(r.partial_file_url || ''),
  additional_links: [],
  guest_bio_url: '',
  workshop_brief_url: '',
  shared_notes: String(r.shared_notes || ''),
  private_notes: '',
}))

    const { error } = await supabase.from('sessions').insert(toInsert)
    setImporting(false)
    if (error) {
      await dialog.alert({ title: 'No se pudo importar', message: error.message, tone: 'danger' })
      return
    }
    setImportedCount(toInsert.length)
    setStep(4)
  }

  const hasErrors = preview.some(r => r._errors.length > 0)

  const STEP_LABELS = ['Archivo', 'Mapear columnas', 'Previsualizar', 'Listo']

  const SAMPLE_CSV = `fecha,numero_clase,titulo,tipo,responsable,modalidad,estado,comision,link_canva,link_parcial,notas
2026-06-03,16,Nuevas tecnologías en ecosistemas,teorica,Emilio,presencial,pendiente,all,,,
2026-06-10,17,Taller de ideación,taller,Emilio,presencial,pendiente,all,,,
2026-06-17,18,Invitado: ecosistemas fintech,invitado,Ezequiel,presencial,pendiente,all,,,`

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>

      <div className="page-head">
        <h1 className="page-title">Importar cronograma</h1>
        <p className="page-meta">
          Desde un CSV o Excel · paso <strong>{step}</strong> de 4
        </p>
      </div>

      <ol className="steps">
        {STEP_LABELS.map((l, i) => {
          const hecho = step > i + 1
          const ahora = step === i + 1
          return (
            <li key={i} className={`step${hecho ? ' is-done' : ''}${ahora ? ' is-now' : ''}`}
              aria-current={ahora ? 'step' : undefined}>
              <span className="step-dot" aria-hidden="true">
                {hecho ? <i className="ti ti-check"></i> : i + 1}
              </span>
              <span className="step-label">{l}</span>
              {i < STEP_LABELS.length - 1 && <span className="step-line" aria-hidden="true"></span>}
            </li>
          )
        })}
      </ol>

      <div className="import-grid">
        <div className="card">

          {/* Step 1: Upload */}
          {step === 1 && (
            <>
              <h2 className="card-title">Seleccioná el archivo</h2>
              {/* Era un <div> con onClick: con teclado no se podía abrir. */}
              <button type="button" className="dropzone"
                onClick={() => document.getElementById('file-input')?.click()}>
                <i className="ti ti-upload" aria-hidden="true"></i>
                <span style={{ display: 'block', fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Elegí un archivo
                </span>
                <span style={{ display: 'block', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 'var(--space-1)' }}>
                  CSV o Excel (.xlsx), hasta 5 MB
                </span>
              </button>
              <input id="file-input" type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={handleFile} />

              {fileName && (
                <div className="alert alert-success" style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '8px', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                  <i className="ti ti-file-check" aria-hidden="true"></i>
                  <strong>{fileName}</strong> — {rawData.length} filas detectadas
                </div>
              )}

              <div style={{ marginTop: 'var(--space-6)', display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary"
                  onClick={() => rawData.length > 0
                    ? setStep(2)
                    : dialog.alert({ title: 'Falta el archivo', message: 'Subí primero el CSV con el cronograma.' })}>
                  Siguiente <i className="ti ti-arrow-right" aria-hidden="true"></i>
                </button>
              </div>
            </>
          )}

          {/* Step 2: Mapping */}
          {step === 2 && (
            <>
              <h2 className="card-title">Mapeá las columnas</h2>
              <p className="card-sub">Asigná cada campo del sistema a la columna de tu archivo.</p>

              <div className="field">
                <label className="field-label" htmlFor="com-defecto">
                  Comisión por defecto, si el archivo no la trae
                </label>
                <select id="com-defecto" className="field-input" style={{ maxWidth: '320px' }}
                  value={commissionScope} onChange={e => setCommissionScope(e.target.value)}>
                  <option value="all">Todas las comisiones</option>
                  <option value="first">Primera comisión del curso</option>
                </select>
              </div>

              {FIELD_DEFS.map(f => (
                <div key={f.key} className="map-row">
                  <label className="map-name" htmlFor={`map-${f.key}`}>
                    {f.label}
                    {f.required
                      ? <span style={{ color: 'var(--danger)' }}> *</span>
                      : <small> (opcional)</small>}
                  </label>
                  <i className="ti ti-arrow-right" aria-hidden="true"></i>
                  <select id={`map-${f.key}`} className="field-input"
                    value={mapping[f.key] || ''}
                    onChange={e => setMapping({...mapping, [f.key]: e.target.value})}>
                    <option value="">— No mapear —</option>
                    {columns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              ))}

              <div style={{ marginTop: 'var(--space-6)', display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
                <button className="btn btn-ghost" onClick={() => setStep(1)}>
                  <i className="ti ti-arrow-left" aria-hidden="true"></i> Atrás
                </button>
                <button className="btn btn-primary" onClick={buildPreview}>
                  Previsualizar <i className="ti ti-arrow-right" aria-hidden="true"></i>
                </button>
              </div>
            </>
          )}

          {/* Step 3: Preview */}
          {step === 3 && (
            <>
              <h2 className="card-title">Previsualizar · {preview.length} filas</h2>
              {hasErrors ? (
                <div className="alert alert-warning" style={{ padding: '8px 12px', borderRadius: '8px', alignItems: 'center', gap: '8px', fontSize: '12px', marginBottom: '12px' }}>
                  <i className="ti ti-alert-triangle" aria-hidden="true"></i>
                  Hay filas con errores (marcadas en rojo). Se importarán solo las filas válidas.
                </div>
              ) : (
                <div className="alert alert-success" style={{ padding: '8px 12px', borderRadius: '8px', alignItems: 'center', gap: '8px', fontSize: '12px', marginBottom: '12px' }}>
                  <i className="ti ti-circle-check" aria-hidden="true"></i>
                  Sin errores detectados. Listo para importar.
                </div>
              )}
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      {['#','Fecha','Clase','Título','Tipo','Resp.','Estado','Problema'].map(h => (
                        <th key={h} scope="col">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i} style={r._errors.length ? { background: 'var(--badge-danger-bg)' } : undefined}>
                        <td className="tabular" style={{ color: 'var(--text-muted)' }}>{i+1}</td>
                        <td className="tabular" style={{ whiteSpace: 'nowrap' }}>{r.date}</td>
                        <td className="tabular">{r.class_number}</td>
                        <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</td>
                        <td>{r.type}</td>
                        <td>{r.responsible}</td>
                        <td>{r.status}</td>
                        <td style={{ color: 'var(--badge-danger-fg)', fontSize: 'var(--text-xs)' }}>{r._errors.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 'var(--space-6)', display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
                <button className="btn btn-ghost" onClick={() => setStep(2)}>
                  <i className="ti ti-arrow-left" aria-hidden="true"></i> Atrás
                </button>
                <button className="btn btn-primary" onClick={confirmImport} disabled={importing}
                  style={{ cursor: importing ? 'wait' : 'pointer' }}>
                  {importing
                    ? 'Importando…'
                    : `Importar ${preview.filter(r => !r._errors.length).length} encuentros`}
                  <i className="ti ti-check" aria-hidden="true"></i>
                </button>
              </div>
            </>
          )}

          {/* Step 4: Success */}
          {step === 4 && (
            <div style={{ textAlign: 'center', padding: 'var(--space-8) var(--space-4)' }}>
              <i className="ti ti-circle-check" style={{ fontSize: '48px', color: 'var(--success)', display: 'block', marginBottom: 'var(--space-4)' }} aria-hidden="true"></i>
              <h2 style={{ margin: 0, fontSize: 'var(--text-2xl)', fontWeight: 700, letterSpacing: '-.02em' }}>
                Listo
              </h2>
              <p style={{ margin: 'var(--space-2) 0 var(--space-6)', fontSize: 'var(--text-base)', color: 'var(--text-muted)' }}>
                Se importaron <strong style={{ color: 'var(--text-primary)' }}>{importedCount}</strong> encuentros al cronograma.
              </p>
              <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'center', flexWrap: 'wrap' }}>
                <a className="btn btn-primary" href={`/courses/schedule?c=${courseId}`} style={{ textDecoration: 'none' }}>
                  <i className="ti ti-calendar-event" aria-hidden="true"></i> Ver cronograma
                </a>
                <button className="btn btn-ghost"
                  onClick={() => { setStep(1); setRawData([]); setFileName(''); setPreview([]) }}>
                  Importar otro
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Ayuda: qué forma tiene que tener el archivo. */}
        <aside className="card" style={{ padding: 'var(--space-4)' }}>
          <h2 className="card-title" style={{ fontSize: 'var(--text-base)' }}>Formato de ejemplo</h2>
          <pre className="code-block">{SAMPLE_CSV}</pre>
          <p className="field-help">
            Copiá esto en un archivo .csv, o armalo en Excel y guardalo como CSV.
          </p>

          <p className="field-label" style={{ marginTop: 'var(--space-4)' }}>Tipos válidos</p>
          <p className="field-help" style={{ marginTop: 0 }}>
            teorica, practica, taller, invitado, parcial, recuperatorio, exposicion, proyecto
          </p>

          <p className="field-label" style={{ marginTop: 'var(--space-3)' }}>Estados válidos</p>
          <p className="field-help" style={{ marginTop: 0 }}>
            pendiente, dada, reprogramada, cancelada
          </p>
        </aside>
      </div>
    </div>
  )
}
