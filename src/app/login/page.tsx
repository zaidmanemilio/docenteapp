'use client'
// src/app/login/page.tsx

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Email o contraseña incorrectos.')
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    // La portada tenía su propia paleta a mano (#21213a, #2d2d4e, #fff):
    // quedaba igual en los dos temas y con un violeta que ya no existe en
    // ningún otro lado. Ahora usa los mismos tokens que el resto.
    <div style={{
      minHeight: '100dvh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '14px',
        padding: '40px',
        width: '100%',
        maxWidth: '390px',
        boxShadow: '0 10px 40px rgb(0 0 0 / .08)',
      }}>
        <h1 style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
          fontSize: 'var(--text-xl)', fontWeight: 700, letterSpacing: '-.02em',
          color: 'var(--text-primary)', margin: 0,
        }}>
          <i className="ti ti-school" style={{ color: 'var(--accent)', fontSize: '22px' }} aria-hidden="true"></i>
          DocenteApp
        </h1>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: 'var(--space-2) 0 var(--space-8)' }}>
          Plataforma de gestión docente universitaria
        </p>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '16px' }}>
            <label className="field-label">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="docente@universidad.edu"
              className="field-input"
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label className="field-label">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="field-input"
            />
          </div>

          {error && (
            <p role="alert" style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', cursor: loading ? 'wait' : 'pointer' }}
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textAlign: 'center', marginTop: 'var(--space-4)', lineHeight: 1.5 }}>
          ¿Olvidaste tu contraseña? Pedile al administrador que te reenvíe el acceso.
        </p>
      </div>
    </div>
  )
}
