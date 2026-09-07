'use client'
// src/components/ui/RichTextArea.tsx
// Campo de texto con una barra mínima de formato.
//
// No es un editor visual: se sigue escribiendo texto plano y los botones
// insertan las marcas (**negrita**, - viñeta, etc.). Se eligió así a
// propósito — un editor visual guarda HTML, y eso obliga a limpiarlo antes de
// mostrarlo para que nadie pueda inyectar código. Con texto plano lo que se
// guarda es exactamente lo que se escribió.
import { useRef } from 'react'

interface Props {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  rows?: number
  placeholder?: string
  style?: React.CSSProperties
}

type Accion =
  | { tipo: 'envolver'; marca: string }
  | { tipo: 'prefijo'; marca: string }

const BOTONES: { icono: string; titulo: string; accion: Accion }[] = [
  { icono: 'ti-bold',            titulo: 'Negrita',        accion: { tipo: 'envolver', marca: '**' } },
  { icono: 'ti-italic',          titulo: 'Cursiva',        accion: { tipo: 'envolver', marca: '_' } },
  { icono: 'ti-h-2',             titulo: 'Título',         accion: { tipo: 'prefijo',  marca: '## ' } },
  { icono: 'ti-list',            titulo: 'Viñetas',        accion: { tipo: 'prefijo',  marca: '- ' } },
  { icono: 'ti-list-numbers',    titulo: 'Lista numerada', accion: { tipo: 'prefijo',  marca: '1. ' } },
  { icono: 'ti-link',            titulo: 'Enlace',         accion: { tipo: 'envolver', marca: '[]()' } },
]

export default function RichTextArea({ value, onChange, disabled, rows = 4, placeholder, style }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)

  function aplicar(accion: Accion) {
    const ta = ref.current
    if (!ta) return
    const ini = ta.selectionStart
    const fin = ta.selectionEnd
    const sel = value.slice(ini, fin)

    let texto = value
    let cursor = fin

    if (accion.tipo === 'envolver') {
      if (accion.marca === '[]()') {
        const etiqueta = sel || 'texto'
        texto = value.slice(0, ini) + `[${etiqueta}](https://)` + value.slice(fin)
        cursor = ini + etiqueta.length + 11 // dentro de la URL
      } else {
        const m = accion.marca
        texto = value.slice(0, ini) + m + (sel || 'texto') + m + value.slice(fin)
        cursor = ini + m.length + (sel || 'texto').length + m.length
      }
    } else {
      // Prefijo por línea: se aplica a todas las líneas seleccionadas.
      const desde = value.lastIndexOf('\n', ini - 1) + 1
      const hasta = value.indexOf('\n', fin) === -1 ? value.length : value.indexOf('\n', fin)
      const bloque = value.slice(desde, hasta)
      const conPrefijo = bloque
        .split('\n')
        .map((l, i) => {
          const m = accion.marca === '1. ' ? `${i + 1}. ` : accion.marca
          return l.startsWith(m) ? l : m + l
        })
        .join('\n')
      texto = value.slice(0, desde) + conPrefijo + value.slice(hasta)
      cursor = desde + conPrefijo.length
    }

    onChange(texto)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(cursor, cursor)
    })
  }

  return (
    <div>
      {!disabled && (
        <div style={{ display: 'flex', gap: '4px', marginBottom: '4px', flexWrap: 'wrap' }}>
          {BOTONES.map(b => (
            <button
              key={b.icono}
              type="button"
              onClick={() => aplicar(b.accion)}
              title={b.titulo}
              aria-label={b.titulo}
              style={{
                width: '30px', height: '28px',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid var(--border)', borderRadius: '6px',
                background: 'var(--surface)', color: 'var(--text-secondary)',
                cursor: 'pointer', fontSize: '14px', padding: 0,
              }}
            >
              <i className={`ti ${b.icono}`} aria-hidden="true"></i>
            </button>
          ))}
        </div>
      )}

      <textarea
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        rows={rows}
        placeholder={placeholder}
        style={style}
      />

      {!disabled && (
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Los saltos de línea se respetan y las direcciones web se convierten en
          enlaces solas. También podés escribir a mano: <code>**negrita**</code>,{' '}
          <code>_cursiva_</code>, <code>- viñeta</code>, <code>1. numerada</code>,{' '}
          <code>## título</code>.
        </p>
      )}
    </div>
  )
}
