'use client'
// src/app/(app)/profile/page.tsx
// Autoedición del propio usuario: nombre/apellido y cambio de contraseña.
// No usa service_role: cada usuario edita SU perfil (permitido por RLS:
// id = auth.uid()) y cambia su propia contraseña con auth.updateUser.
// El cambio de contraseña exige reautenticar con la contraseña actual.

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'

export default function ProfilePage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [email, setEmail] = useState('')

  // Datos personales
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameMsg, setNameMsg] = useState('')
  const [nameErr, setNameErr] = useState('')

  // Contraseña
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [newPw2, setNewPw2] = useState('')
  const [savingPw, setSavingPw] = useState(false)
  const [pwMsg, setPwMsg] = useState('')
  const [pwErr, setPwErr] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setEmail(user.email || '')
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (prof) {
        setProfile(prof)
        setFirstName(prof.first_name || '')
        setLastName(prof.last_name || '')
      }
      setLoading(false)
    }
    load()
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  async function saveName() {
    setSavingName(true); setNameMsg(''); setNameErr('')
    if (!firstName.trim() || !lastName.trim()) {
      setNameErr('Nombre y apellido son obligatorios.'); setSavingName(false); return
    }
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim()
    const { error } = await supabase
      .from('profiles')
      .update({ first_name: firstName.trim(), last_name: lastName.trim(), full_name: fullName })
      .eq('id', profile!.id)
    setSavingName(false)
    if (error) { setNameErr(`No se pudo guardar: ${error.message}`); return }
    setNameMsg('Datos actualizados.')
    router.refresh()
  }

  async function changePassword() {
    setSavingPw(true); setPwMsg(''); setPwErr('')
    if (!currentPw || !newPw || !newPw2) {
      setPwErr('Completá los tres campos de contraseña.'); setSavingPw(false); return
    }
    if (newPw.length < 8) {
      setPwErr('La nueva contraseña debe tener al menos 8 caracteres.'); setSavingPw(false); return
    }
    if (newPw !== newPw2) {
      setPwErr('Las contraseñas nuevas no coinciden.'); setSavingPw(false); return
    }
    // 1) Reautenticar: verificar la contraseña actual iniciando sesión con ella.
    const { error: reauthErr } = await supabase.auth.signInWithPassword({ email, password: currentPw })
    if (reauthErr) {
      setPwErr('La contraseña actual es incorrecta.'); setSavingPw(false); return
    }
    // 2) Cambiar la contraseña del propio usuario.
    const { error: updErr } = await supabase.auth.updateUser({ password: newPw })
    setSavingPw(false)
    if (updErr) { setPwErr(`No se pudo cambiar: ${updErr.message}`); return }
    setPwMsg('Contraseña actualizada.')
    setCurrentPw(''); setNewPw(''); setNewPw2('')
  }

  if (loading) return <div style={{ padding: '24px', color: 'var(--text-muted)' }}>Cargando...</div>

  const labelStyle = { fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }
  const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid var(--input-border)', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }
  const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', marginBottom: '16px' }

  return (
    <div style={{ flex: 1, padding: '24px', maxWidth: '640px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '4px' }}>Mi perfil</h2>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
        Editá tus datos personales y tu contraseña.
      </p>

      {/* Datos personales */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>Datos personales</h3>
        {nameErr && <div className="alert alert-danger" style={{ padding: '8px 12px', borderRadius: '8px', fontSize: '12px', marginBottom: '12px' }}>{nameErr}</div>}
        {nameMsg && <div className="alert alert-success" style={{ padding: '8px 12px', borderRadius: '8px', fontSize: '12px', marginBottom: '12px' }}>{nameMsg}</div>}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Nombre</label>
            <input style={inputStyle} value={firstName} onChange={e => setFirstName(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Apellido</label>
            <input style={inputStyle} value={lastName} onChange={e => setLastName(e.target.value)} />
          </div>
        </div>
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Email</label>
          <input style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }} value={email} disabled />
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            El email solo lo puede cambiar un administrador.
          </p>
        </div>
        <button onClick={saveName} disabled={savingName} style={{ padding: '8px 16px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: savingName ? 0.6 : 1 }}>
          {savingName ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>

      {/* Contraseña */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>Cambiar contraseña</h3>
        {pwErr && <div className="alert alert-danger" style={{ padding: '8px 12px', borderRadius: '8px', fontSize: '12px', marginBottom: '12px' }}>{pwErr}</div>}
        {pwMsg && <div className="alert alert-success" style={{ padding: '8px 12px', borderRadius: '8px', fontSize: '12px', marginBottom: '12px' }}>{pwMsg}</div>}
        <div style={{ marginBottom: '12px' }}>
          <label style={labelStyle}>Contraseña actual</label>
          <input type="password" style={inputStyle} value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Nueva contraseña (mín. 8)</label>
            <input type="password" style={inputStyle} value={newPw} onChange={e => setNewPw(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Repetir nueva contraseña</label>
            <input type="password" style={inputStyle} value={newPw2} onChange={e => setNewPw2(e.target.value)} />
          </div>
        </div>
        <button onClick={changePassword} disabled={savingPw} style={{ padding: '8px 16px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: savingPw ? 0.6 : 1 }}>
          {savingPw ? 'Cambiando...' : 'Cambiar contraseña'}
        </button>
      </div>
    </div>
  )
}
