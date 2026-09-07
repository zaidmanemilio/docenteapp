// src/components/ui/RichText.tsx
// Muestra texto con formato simple (estilo Markdown reducido).
//
// Antes estos campos se pintaban con <p>{texto}</p>: HTML colapsa los saltos
// de línea y los espacios, así que todo aparecía corrido, y las direcciones
// web quedaban como texto muerto.
//
// El resultado se arma como elementos de React, NO con HTML crudo. Es a
// propósito: estas notas las escribe una persona y las leen otras, así que si
// se inyectara HTML tal cual, alguien podría meter un <script>. Al construir
// elementos, cualquier etiqueta que venga en el texto se muestra como texto.
//
// Qué entiende:
//   línea en blanco   -> párrafo nuevo
//   salto simple      -> salto de línea
//   # / ## / ###      -> títulos (los tres tamaños)
//   - o *             -> lista con viñetas
//   1.                -> lista numerada
//   **negrita**
//   *cursiva* o _cursiva_
//   [texto](url)      -> enlace
//   https://... o www...  -> enlace automático
import React from 'react'

const RE_INLINE = new RegExp(
  [
    '(\\*\\*[^*]+\\*\\*)',                 // **negrita**
    '(\\*[^*\\n]+\\*)',                    // *cursiva*
    '(_[^_\\n]+_)',                        // _cursiva_
    '(\\[[^\\]]+\\]\\([^)\\s]+\\))',       // [texto](url)
    '((?:https?://|www\\.)[^\\s<>]+)',     // url suelta
  ].join('|'),
  'g',
)

/** Quita la puntuación final que suele quedar pegada a una URL en una frase. */
function limpiarUrl(url: string): { href: string; sobra: string } {
  const m = url.match(/[.,;:!?)\]]+$/)
  if (!m) return { href: url, sobra: '' }
  return { href: url.slice(0, -m[0].length), sobra: m[0] }
}

function Enlace({ href, texto }: { href: string; texto: string }) {
  const url = href.startsWith('http') ? href : `https://${href}`
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: 'var(--accent)', textDecoration: 'underline', wordBreak: 'break-all' }}
    >
      {texto}
    </a>
  )
}

/** Procesa negrita, cursiva y enlaces dentro de una línea. */
function inline(texto: string, keyBase: string): React.ReactNode[] {
  const nodos: React.ReactNode[] = []
  let ultimo = 0
  let i = 0

  for (const m of texto.matchAll(RE_INLINE)) {
    const idx = m.index ?? 0
    if (idx > ultimo) nodos.push(texto.slice(ultimo, idx))
    const t = m[0]

    if (t.startsWith('**')) {
      nodos.push(<strong key={`${keyBase}-b${i}`}>{t.slice(2, -2)}</strong>)
    } else if (t.startsWith('[')) {
      const corte = t.indexOf('](')
      nodos.push(
        <Enlace key={`${keyBase}-l${i}`} href={t.slice(corte + 2, -1)} texto={t.slice(1, corte)} />,
      )
    } else if (t.startsWith('http') || t.startsWith('www.')) {
      const { href, sobra } = limpiarUrl(t)
      nodos.push(<Enlace key={`${keyBase}-u${i}`} href={href} texto={href} />)
      if (sobra) nodos.push(sobra)
    } else {
      // *cursiva* o _cursiva_
      nodos.push(<em key={`${keyBase}-i${i}`}>{t.slice(1, -1)}</em>)
    }

    ultimo = idx + t.length
    i++
  }

  if (ultimo < texto.length) nodos.push(texto.slice(ultimo))
  return nodos
}

interface RichTextProps {
  texto?: string | null
  /** Color del texto. Los enlaces siempre usan el color de acento. */
  color?: string
  size?: string
}

export default function RichText({ texto, color = 'var(--text-primary)', size = '13px' }: RichTextProps) {
  if (!texto || !texto.trim()) return null

  const lineas = texto.replace(/\r\n/g, '\n').split('\n')
  const bloques: React.ReactNode[] = []

  // Acumuladores de la lista que se esté armando
  let lista: string[] = []
  let tipoLista: 'ul' | 'ol' | null = null
  let parrafo: string[] = []

  const cerrarParrafo = () => {
    if (parrafo.length === 0) return
    const k = `p${bloques.length}`
    bloques.push(
      <p key={k} style={{ margin: '0 0 8px', lineHeight: 1.6 }}>
        {parrafo.map((l, i) => (
          <React.Fragment key={`${k}-${i}`}>
            {i > 0 && <br />}
            {inline(l, `${k}-${i}`)}
          </React.Fragment>
        ))}
      </p>,
    )
    parrafo = []
  }

  const cerrarLista = () => {
    if (lista.length === 0) return
    const k = `l${bloques.length}`
    const items = lista.map((it, i) => (
      <li key={`${k}-${i}`} style={{ marginBottom: '3px', lineHeight: 1.6 }}>
        {inline(it, `${k}-${i}`)}
      </li>
    ))
    bloques.push(
      tipoLista === 'ol'
        ? <ol key={k} style={{ margin: '0 0 8px', paddingLeft: '22px' }}>{items}</ol>
        : <ul key={k} style={{ margin: '0 0 8px', paddingLeft: '22px', listStyle: 'disc' }}>{items}</ul>,
    )
    lista = []
    tipoLista = null
  }

  const cerrarTodo = () => { cerrarParrafo(); cerrarLista() }

  for (const linea of lineas) {
    const l = linea.trimEnd()

    if (!l.trim()) { cerrarTodo(); continue }

    const titulo = l.match(/^(#{1,3})\s+(.*)$/)
    if (titulo) {
      cerrarTodo()
      const nivel = titulo[1].length
      const tam = nivel === 1 ? '17px' : nivel === 2 ? '15px' : '14px'
      bloques.push(
        <p key={`h${bloques.length}`} style={{ margin: '10px 0 6px', fontSize: tam, fontWeight: 600, lineHeight: 1.4 }}>
          {inline(titulo[2], `h${bloques.length}`)}
        </p>,
      )
      continue
    }

    const vineta = l.match(/^\s*[-*]\s+(.*)$/)
    if (vineta) {
      cerrarParrafo()
      if (tipoLista === 'ol') cerrarLista()
      tipoLista = 'ul'
      lista.push(vineta[1])
      continue
    }

    const numerada = l.match(/^\s*\d+[.)]\s+(.*)$/)
    if (numerada) {
      cerrarParrafo()
      if (tipoLista === 'ul') cerrarLista()
      tipoLista = 'ol'
      lista.push(numerada[1])
      continue
    }

    cerrarLista()
    parrafo.push(l)
  }
  cerrarTodo()

  return <div style={{ fontSize: size, color }}>{bloques}</div>
}
