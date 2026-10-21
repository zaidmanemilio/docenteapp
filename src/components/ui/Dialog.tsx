'use client'
// src/components/ui/Dialog.tsx
//
// Diálogos propios para reemplazar alert() / confirm() / prompt() del
// navegador. Había 47 llamadas nativas repartidas por la app.
//
// Por qué sacarlas:
//   - El navegador las dibuja con SU tipografía y SU chrome: en medio de una
//     app cuidada parecen un error del sistema, no una pregunta del producto.
//   - Bloquean el hilo: no se puede mostrar "Eliminando…" ni deshabilitar
//     nada mientras están abiertas.
//   - prompt() devuelve texto libre. Para pedir un permiso ("edit / read")
//     eso es pedirle al usuario que adivine el vocabulario interno.
//   - En iOS Safari se pueden silenciar ("No mostrar más diálogos"), y ahí la
//     app queda muda: el usuario confirma un borrado y no pasa nada.
//
// La API es la misma de siempre pero con await, así el reemplazo en cada
// pantalla es mecánico:
//
//   const dialog = useDialog()
//   if (!await dialog.confirm('¿Eliminar este encuentro?')) return
//   await dialog.alert({ message: 'No se pudo guardar.', tone: 'danger' })
//   const nombre = await dialog.prompt({ label: 'Nombre', defaultValue: x })
import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from 'react'

type Tone = 'neutral' | 'danger'

interface Base {
  title?: string
  /** Puede traer saltos de línea: se respetan. */
  message?: string
  tone?: Tone
}
export interface ConfirmOptions extends Base {
  confirmLabel?: string
  cancelLabel?: string
}
export interface AlertOptions extends Base {
  okLabel?: string
}
export interface PromptOptions extends Base {
  label?: string
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
  /** 'text' por defecto; 'number' para valores numéricos. */
  inputType?: 'text' | 'number'
}

interface DialogApi {
  alert: (opts: AlertOptions | string) => Promise<void>
  confirm: (opts: ConfirmOptions | string) => Promise<boolean>
  prompt: (opts: PromptOptions | string) => Promise<string | null>
}

type Pending =
  | { kind: 'alert';   opts: AlertOptions;   resolve: (v: void) => void }
  | { kind: 'confirm'; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'prompt';  opts: PromptOptions;  resolve: (v: string | null) => void }

const DialogContext = createContext<DialogApi | null>(null)

/** Diálogos de la app. Solo válido dentro de <DialogProvider>. */
export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useDialog() debe usarse dentro de <DialogProvider>.')
  return ctx
}

function asOptions<T extends Base>(opts: T | string): T {
  return (typeof opts === 'string' ? { message: opts } : opts) as T
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  const api = useRef<DialogApi>({
    alert: o => new Promise<void>(resolve => {
      setPending({ kind: 'alert', opts: asOptions<AlertOptions>(o), resolve })
    }),
    confirm: o => new Promise<boolean>(resolve => {
      setPending({ kind: 'confirm', opts: asOptions<ConfirmOptions>(o), resolve })
    }),
    prompt: o => new Promise<string | null>(resolve => {
      const opts = asOptions<PromptOptions>(o)
      setDraft(opts.defaultValue ?? '')
      setPending({ kind: 'prompt', opts, resolve })
    }),
  }).current

  // Cerrar resolviendo. `cancelar` es lo que devuelve cada tipo al desistir:
  // undefined para alert, false para confirm, null para prompt.
  const close = useCallback((aceptado: boolean) => {
    if (!pending) return
    setPending(null)
    if (pending.kind === 'alert') pending.resolve(undefined)
    else if (pending.kind === 'confirm') pending.resolve(aceptado)
    else pending.resolve(aceptado ? draft : null)
  }, [pending, draft])

  // Escape cancela. Foco al control que corresponda al abrir.
  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(false) }
    document.addEventListener('keydown', onKey)
    const t = window.setTimeout(() => {
      if (pending.kind === 'prompt') { inputRef.current?.focus(); inputRef.current?.select() }
      else confirmRef.current?.focus()
    }, 0)
    return () => { document.removeEventListener('keydown', onKey); window.clearTimeout(t) }
  }, [pending, close])

  return (
    <DialogContext.Provider value={api}>
      {children}
      {pending && (
        <div
          className="modal-overlay"
          onMouseDown={e => { if (e.target === e.currentTarget) close(false) }}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1100, padding: '20px',
          }}
        >
          <div
            className="modal-panel"
            role={pending.kind === 'alert' ? 'alertdialog' : 'dialog'}
            aria-modal="true"
            aria-label={pending.opts.title || 'Aviso'}
            style={{
              background: 'var(--surface)', borderRadius: '12px',
              width: '440px', maxWidth: '100%',
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ padding: 'var(--space-6) var(--space-6) var(--space-6)' }}>
              <h3 style={{
                margin: 0, fontSize: 'var(--text-lg)', fontWeight: 600,
                letterSpacing: '-0.01em', color: 'var(--text-primary)',
              }}>
                {pending.opts.title || tituloPorDefecto(pending)}
              </h3>

              {pending.opts.message && (
                <p style={{
                  margin: 'var(--space-3) 0 0',
                  fontSize: 'var(--text-sm)', lineHeight: 1.55,
                  color: 'var(--text-secondary)', whiteSpace: 'pre-wrap',
                }}>
                  {pending.opts.message}
                </p>
              )}

              {pending.kind === 'prompt' && (
                <label style={{ display: 'block', marginTop: 'var(--space-6)' }}>
                  {pending.opts.label && (
                    <span className="field-label">{pending.opts.label}</span>
                  )}
                  <input
                    ref={inputRef}
                    type={pending.opts.inputType || 'text'}
                    value={draft}
                    placeholder={pending.opts.placeholder}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') close(true) }}
                    className="field-input"
                  />
                </label>
              )}
            </div>

            <div style={{
              display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)',
              padding: 'var(--space-4) var(--space-6)',
              borderTop: '1px solid var(--border)',
              background: 'var(--bg)',
              borderRadius: '0 0 12px 12px',
            }}>
              {pending.kind !== 'alert' && (
                <button className="btn btn-ghost" onClick={() => close(false)}>
                  {(pending.opts as ConfirmOptions).cancelLabel || 'Cancelar'}
                </button>
              )}
              <button
                ref={confirmRef}
                className={pending.opts.tone === 'danger' ? 'btn btn-danger' : 'btn btn-primary'}
                onClick={() => close(true)}
              >
                {etiquetaAceptar(pending)}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  )
}

function tituloPorDefecto(p: Pending): string {
  if (p.kind === 'confirm') return '¿Confirmás?'
  if (p.kind === 'prompt') return 'Completá el dato'
  return p.opts.tone === 'danger' ? 'No se pudo completar' : 'Aviso'
}

function etiquetaAceptar(p: Pending): string {
  if (p.kind === 'alert') return (p.opts as AlertOptions).okLabel || 'Entendido'
  if (p.kind === 'confirm') return (p.opts as ConfirmOptions).confirmLabel || 'Confirmar'
  return (p.opts as PromptOptions).confirmLabel || 'Guardar'
}
