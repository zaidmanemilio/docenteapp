'use client'
// src/app/(app)/courses/[courseId]/import/page.tsx

import { useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { SessionType, SessionModality, SessionStatus } from '@/types'
import { readCsvFile } from '@/lib/csv-encoding'

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
  const { courseId } = useParams<{ courseId: string }>()
  const supabase = createClient()

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
    if (error) { alert('Error al importar: ' + error.message); return }
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
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.8.0/tabler-icons.min.css" />

      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Importar cronograma</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>Cargá tu cronograma desde un archivo CSV o Excel.</p>
      </div>

      {/* Step indicators */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '24px' }}>
        {STEP_LABELS.map((l, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%',
                background: step > i+1 ? 'var(--success)' : step === i+1 ? 'var(--accent)' : 'var(--border)',
                color: step >= i+1 ? 'white' : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '13px', fontWeight: 600, flexShrink: 0,
              }}>
                {step > i+1 ? <i className="ti ti-check" aria-hidden="true"></i> : i+1}
              </div>
              <span style={{ fontSize: '12px', fontWeight: step === i+1 ? 600 : 400, color: step === i+1 ? 'var(--text-primary)' : 'var(--text-muted)' }}>{l}</span>
            </div>
            {i < 3 && <div style={{ width: '32px', height: '1px', background: 'var(--border)', margin: '0 8px' }}></div>}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '20px' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' }}>

          {/* Step 1: Upload */}
          {step === 1 && (
            <>
              <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>Seleccioná el archivo</h3>
              <div
                onClick={() => document.getElementById('file-input')?.click()}
                style={{ border: '2px dashed var(--border)', borderRadius: '12px', padding: '40px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#6366f1')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#e5e7eb')}
              >
                <i className="ti ti-upload" style={{ fontSize: '36px', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }} aria-hidden="true"></i>
                <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '4px' }}>Hacé clic para seleccionar archivo</p>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>CSV o Excel (.xlsx) — máx. 5MB</p>
              </div>
              <input id="file-input" type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={handleFile} />

              {fileName && (
                <div className="alert alert-success" style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '8px', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                  <i className="ti ti-file-check" aria-hidden="true"></i>
                  <strong>{fileName}</strong> — {rawData.length} filas detectadas
                </div>
              )}

              <div style={{ marginTop: '20px', textAlign: 'right' }}>
                <button
                  onClick={() => rawData.length > 0 ? setStep(2) : alert('Primero subí un archivo.')}
                  style={{ padding: '8px 20px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  Siguiente <i className="ti ti-arrow-right" aria-hidden="true"></i>
                </button>
              </div>
            </>
          )}

          {/* Step 2: Mapping */}
          {step === 2 && (
            <>
              <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>Mapeá las columnas</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>Asigná cada campo del sistema a la columna de tu archivo.</p>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px' }}>Comisión por defecto (si el archivo no la trae)</label>
                <select value={commissionScope} onChange={e => setCommissionScope(e.target.value)} style={{ padding: '8px 10px', border: '1px solid var(--input-border)', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }}>
                  <option value="all">Todas las comisiones</option>
                  <option value="first">Primera comisión del curso</option>
                </select>
              </div>

              {FIELD_DEFS.map(f => (
                <div key={f.key} style={{ display: 'grid', gridTemplateColumns: '160px 24px 1fr', gap: '8px', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '13px', fontWeight: 500 }}>
                    {f.label}{f.required ? <span style={{ color: 'var(--danger)' }}> *</span> : <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}> (opc.)</span>}
                  </span>
                  <i className="ti ti-arrow-right" style={{ color: 'var(--text-muted)', fontSize: '14px' }} aria-hidden="true"></i>
                  <select
                    value={mapping[f.key] || ''}
                    onChange={e => setMapping({...mapping, [f.key]: e.target.value})}
                    style={{ padding: '6px 8px', border: '1px solid var(--input-border)', borderRadius: '6px', fontSize: '12px', fontFamily: 'inherit' }}
                  >
                    <option value="">— No mapear —</option>
                    {columns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              ))}

              <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between' }}>
                <button onClick={() => setStep(1)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <i className="ti ti-arrow-left" aria-hidden="true"></i> Atrás
                </button>
                <button onClick={buildPreview} style={{ padding: '8px 20px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  Previsualizar <i className="ti ti-arrow-right" aria-hidden="true"></i>
                </button>
              </div>
            </>
          )}

          {/* Step 3: Preview */}
          {step === 3 && (
            <>
              <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px' }}>Previsualizar ({preview.length} filas)</h3>
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
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr>
                      {['#','Fecha','Clase','Título','Tipo','Resp.','Estado','Error'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '6px 8px', fontSize: '11px', fontWeight: 600, background: 'var(--hover-bg)', border: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i} style={{ background: r._errors.length ? 'var(--badge-danger-bg)' : 'var(--surface)' }}>
                        <td style={{ padding: '5px 8px', border: '1px solid var(--border)' }}>{i+1}</td>
                        <td style={{ padding: '5px 8px', border: '1px solid var(--border)' }}>{r.date}</td>
                        <td style={{ padding: '5px 8px', border: '1px solid var(--border)' }}>{r.class_number}</td>
                        <td style={{ padding: '5px 8px', border: '1px solid var(--border)', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</td>
                        <td style={{ padding: '5px 8px', border: '1px solid var(--border)' }}>{r.type}</td>
                        <td style={{ padding: '5px 8px', border: '1px solid var(--border)' }}>{r.responsible}</td>
                        <td style={{ padding: '5px 8px', border: '1px solid var(--border)' }}>{r.status}</td>
                        <td style={{ padding: '5px 8px', border: '1px solid var(--border)', color: 'var(--danger)', fontSize: '11px' }}>{r._errors.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between' }}>
                <button onClick={() => setStep(2)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <i className="ti ti-arrow-left" aria-hidden="true"></i> Atrás
                </button>
                <button onClick={confirmImport} disabled={importing} style={{ padding: '8px 20px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: importing ? 'wait' : 'pointer', opacity: importing ? 0.7 : 1, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  {importing ? 'Importando...' : `Importar ${preview.filter(r=>!r._errors.length).length} encuentros`}
                  <i className="ti ti-check" aria-hidden="true"></i>
                </button>
              </div>
            </>
          )}

          {/* Step 4: Success */}
          {step === 4 && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <i className="ti ti-circle-check" style={{ fontSize: '56px', color: 'var(--success)', display: 'block', marginBottom: '16px' }} aria-hidden="true"></i>
              <h3 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>¡Importación exitosa!</h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>Se importaron <strong>{importedCount}</strong> encuentros al cronograma.</p>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                <a href={`/courses/${courseId}/schedule`} style={{ padding: '10px 20px', background: 'var(--accent)', color: 'white', textDecoration: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <i className="ti ti-calendar-event" aria-hidden="true"></i> Ver cronograma
                </a>
                <button onClick={() => { setStep(1); setRawData([]); setFileName(''); setPreview([]) }} style={{ padding: '10px 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-muted)' }}>
                  Importar otro
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar: sample CSV */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', height: 'fit-content' }}>
          <p style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>Formato de ejemplo</p>
          <pre style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'pre-wrap', fontFamily: 'monospace', background: 'var(--hover-bg)', padding: '10px', borderRadius: '6px', overflowX: 'auto' }}>{SAMPLE_CSV}</pre>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px' }}>
            Podés copiar esto en un archivo .csv o armarlo en Excel y guardarlo como CSV.
          </p>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px', fontWeight: 500 }}>Tipos válidos:</p>
          <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>teorica, practica, taller, invitado, parcial, recuperatorio, exposicion, proyecto</p>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', fontWeight: 500 }}>Estados válidos:</p>
          <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>pendiente, dada, reprogramada, cancelada</p>
        </div>
      </div>
    </div>
  )
}
