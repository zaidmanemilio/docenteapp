'use client'
// src/app/(app)/courses/[courseId]/users/page.tsx
// Fix: muestra todos los profiles existentes, con botón de sincronización

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile, Commission } from '@/types'
import { readCsvFile } from '@/lib/csv-encoding'

interface Permission {
  id: string
  user_id: string
  course_id: string
  commission_id: string | null
  permission: string
  profiles: Profile | null
}

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}
const COLORS = ['#6366f1','#0d9488','#be185d','#d97706','#059669','#6b7280']
function getColor(id: string) {
  let n = 0; for (const c of id) n += c.charCodeAt(0)
  return COLORS[n % COLORS.length]
}

// Normaliza texto para búsqueda: minúsculas, sin espacios extremos y sin
// diacríticos/acentos. Reutilizable para nombre, apellido, email y DNI.
// "Pérez" -> "perez", "JOSÉ" -> "jose", "  Martín " -> "martin".
function normalizeForSearch(s: string): string {
  return (s || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')               // separa la letra del acento
    .replace(/[\u0300-\u036f]/g, '') // elimina los diacríticos
}

// Escapa un valor para CSV: comillas dobles y separadores.
function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value)
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export default function UsersPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const supabase = createClient()

  const [myProfile,    setMyProfile]    = useState<Profile | null>(null)
  const [allProfiles,  setAllProfiles]  = useState<Profile[]>([])
  const [commissions,  setCommissions]  = useState<Commission[]>([])
  const [permissions,  setPermissions]  = useState<Permission[]>([])
  const [loading,      setLoading]      = useState(true)
  const [syncing,      setSyncing]      = useState(false)
  const [tab,          setTab]          = useState<'by-course'|'by-user'>('by-course')
  const [syncMsg,      setSyncMsg]      = useState('')
  const [userSearch,   setUserSearch]   = useState('')
  // Sub-paso C: alta manual e importación CSV de usuarios.
  const [showNewUser,  setShowNewUser]  = useState(false)
  const [newUser,      setNewUser]      = useState({ first_name: '', last_name: '', email: '', dni: '', password: '', status: 'activo', global_role: 'teacher' })
  const [creating,     setCreating]     = useState(false)
  const [createError,  setCreateError]  = useState('')
  const [showImport,   setShowImport]   = useState(false)
  const [importRows,   setImportRows]   = useState<Record<string, string>[]>([])
  const [importPreview, setImportPreview] = useState<{ row: number; errors: string[] }[] | null>(null)
  const [importing,    setImporting]    = useState(false)
  const [importMsg,    setImportMsg]    = useState('')
  // Edición de usuario.
  const [editUser,     setEditUser]     = useState<null | { id: string; first_name: string; last_name: string; email: string; dni: string; password: string; global_role: string }>(null)
  const [savingUser,   setSavingUser]   = useState(false)
  const [editError,    setEditError]    = useState('')
  // Asignación masiva de permisos.
  const [bulkMode,     setBulkMode]     = useState(false)
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set())
  const [bulkPerm,     setBulkPerm]     = useState<'read'|'edit'>('read')
  const [bulkBusy,     setBulkBusy]     = useState(false)
  const [bulkMsg,      setBulkMsg]      = useState('')

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [myProfileRes, allProfilesRes, commsRes, permsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('commissions').select('*').eq('course_id', courseId),
      supabase.from('user_course_permissions')
        .select('*, profiles(*)')
        .eq('course_id', courseId),
    ])
    setMyProfile(myProfileRes.data)
    setAllProfiles(allProfilesRes.data || [])
    setCommissions(commsRes.data || [])
    setPermissions(permsRes.data || [])
    setLoading(false)
  }, [courseId])

  useEffect(() => { load() }, [load])

  const isAdmin = myProfile?.global_role === 'admin'

  // Sincronizar usuarios de auth.users que no tienen profile
  async function syncUsers() {
    setSyncing(true)
    setSyncMsg('')
    const { error } = await supabase.rpc('sync_missing_profiles')
    if (error) {
      // Si no existe la función RPC, hacer la sincronización básica
      // Recargar perfiles después de la sincronización manual desde Supabase
      setSyncMsg('Si faltan usuarios, ejecutá el SQL de sincronización en Supabase y recargá esta página.')
    } else {
      setSyncMsg('Sincronización completada.')
    }
    setSyncing(false)
    load()
  }

  async function addPermission(userId: string) {
    const perm = prompt('Permiso para este usuario en el curso (edit / read):', 'read')
    if (!['edit','read'].includes(perm || '')) { alert('Permiso inválido. Usá "edit" o "read".'); return }
    await supabase.from('user_course_permissions').upsert({
      user_id: userId, course_id: courseId, commission_id: null, permission: perm
    }, { onConflict: 'user_id,course_id,commission_id' })
    load()
  }

  function toggleBulk(userId: string) {
    setBulkSelected(prev => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId); else next.add(userId)
      return next
    })
  }

  // Asignación masiva: aplica el permiso elegido a todos los usuarios
  // seleccionados, en el curso actual. Upsert => crea o actualiza sin duplicar.
  async function applyBulk() {
    if (bulkSelected.size === 0) { setBulkMsg('Seleccioná al menos un usuario.'); return }
    if (!isAdmin) { setBulkMsg('Solo un administrador puede asignar permisos.'); return }
    setBulkBusy(true)
    setBulkMsg('')
    const rows = [...bulkSelected].map(uid => ({
      user_id: uid, course_id: courseId, commission_id: null, permission: bulkPerm,
    }))
    const { error } = await supabase
      .from('user_course_permissions')
      .upsert(rows, { onConflict: 'user_id,course_id,commission_id' })
    setBulkBusy(false)
    if (error) { setBulkMsg(`Error: ${error.message}`); return }
    setBulkMsg(`Permiso "${bulkPerm}" aplicado a ${rows.length} usuario(s) en este curso.`)
    setBulkSelected(new Set())
    load()
  }

  async function changePerm(id: string, perm: string) {
    await supabase.from('user_course_permissions').update({ permission: perm }).eq('id', id)
    load()
  }

  async function removePerm(id: string) {
    if (!confirm('¿Quitar este permiso?')) return
    await supabase.from('user_course_permissions').delete().eq('id', id)
    load()
  }

  // Lista de usuarios filtrada por la búsqueda normalizada (sin mayúsculas ni
  // acentos). Hoy busca en nombre y rol; cuando existan email/apellido/DNI en
  // el modelo (sub-paso siguiente), se agregan a este mismo arreglo.
  const q = normalizeForSearch(userSearch)
  const filteredProfiles = !q ? allProfiles : allProfiles.filter(u => {
    const haystack = [u.full_name, u.global_role].map(normalizeForSearch)
    return haystack.some(h => h.includes(q))
  })

  // Exporta todos los usuarios a CSV con sus permisos por curso.
  // Nunca incluye passwords, hashes ni tokens (solo datos administrativos).
  function exportUsersCSV() {
    const permsByUser: Record<string, string[]> = {}
    permissions.forEach(p => {
      const com = p.commission_id ? commissions.find(c => c.id === p.commission_id) : null
      const label = `${com?.name || 'Todas'}:${p.permission}`
      ;(permsByUser[p.user_id] ||= []).push(label)
    })

    const headers = ['nombre', 'rol_global', 'permisos_curso']
    const rows = allProfiles.map(u => [
      csvCell(u.full_name),
      csvCell(u.global_role),
      csvCell((permsByUser[u.id] || []).join('; ')),
    ].join(','))

    const csv = [headers.join(','), ...rows].join('\n')
    // BOM para que Excel respete acentos
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `usuarios_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // --- Alta manual: llama a la API de servidor (no expone service_role) ---
  async function submitNewUser() {
    setCreating(true)
    setCreateError('')
    try {
      const res = await fetch('/api/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      })
      // Leer como texto primero: si el servidor devolvió HTML (error 500),
      // res.json() explotaría y ocultaría la causa real.
      const raw = await res.text()
      let data: { error?: string; ok?: boolean } = {}
      try { data = JSON.parse(raw) } catch { /* respuesta no-JSON */ }
      if (!res.ok) {
        setCreateError(data.error || `Error ${res.status}: ${raw.slice(0, 200) || 'sin detalle'}`)
        setCreating(false)
        return
      }
      setShowNewUser(false)
      setNewUser({ first_name: '', last_name: '', email: '', dni: '', password: '', status: 'activo', global_role: 'teacher' })
      load()
    } catch (err) {
      setCreateError(`No se pudo conectar con el servidor: ${err instanceof Error ? err.message : 'error desconocido'}`)
    }
    setCreating(false)
  }

  // --- Import CSV: parseo en cliente, validación y creación en servidor ---
  function parseUsersCSV(text: string): Record<string, string>[] {
    // Limpia una celda: quita BOM, espacios y comillas envolventes ("..." o '...').
    const cleanCell = (v: string) =>
      (v || '')
        .replace(/\ufeff/g, '')        // BOM en cualquier posición
        .trim()
        .replace(/^["']|["']$/g, '')   // comillas envolventes
        .trim()

    const clean = text.replace(/^\ufeff/, '')
    const lines = clean.trim().split(/\r?\n/).filter(l => l.trim())
    if (lines.length < 2) return []
    // Detecta separador: ';' si la cabecera tiene más ';' que ',', si no ','.
    const headerLine = lines[0]
    const sep = (headerLine.split(';').length > headerLine.split(',').length) ? ';' : ','
    const headers = headerLine.split(sep).map(h => cleanCell(h).toLowerCase())
    return lines.slice(1).map((line, i) => {
      const cells = line.split(sep)
      const row: Record<string, string> = { _row: String(i + 2) }
      headers.forEach((h, j) => { if (h) row[h] = cleanCell(cells[j] || '') })
      return row
    })
  }

  async function handleCSVFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await readCsvFile(file)   // detecta UTF-8 o Windows-1252
    const rows = parseUsersCSV(text)
    setImportRows(rows)
    setImportMsg('')
    // Previsualizar (commit:false) para ver errores antes de crear.
    const res = await fetch('/api/users/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows, commit: false }),
    })
    const data = await res.json()
    setImportPreview(data.errors || [])
  }

  async function commitImport() {
    setImporting(true)
    setImportMsg('')
    const res = await fetch('/api/users/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: importRows, commit: true }),
    })
    const data = await res.json()
    if (data.created != null) {
      setImportMsg(`${data.created} usuario(s) creado(s).${data.failed?.length ? ` ${data.failed.length} fallaron.` : ''}`)
      if (!data.failed?.length) { setShowImport(false); setImportRows([]); setImportPreview(null) }
    } else {
      setImportMsg(data.error || 'No se pudo importar.')
    }
    setImporting(false)
    load()
  }

  // --- Edición de usuario ---
  function openEditUser(u: Profile) {
    setEditUser({
      id: u.id,
      first_name: u.first_name || '',
      last_name: u.last_name || '',
      email: u.email || '',
      dni: u.dni || '',
      password: '', // vacío = no cambiar
      global_role: u.global_role || 'teacher',
    })
    setEditError('')
  }

  async function saveEditUser() {
    if (!editUser) return
    setSavingUser(true)
    setEditError('')
    try {
      const res = await fetch('/api/users/update', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editUser),
      })
      const raw = await res.text()
      let data: { error?: string } = {}
      try { data = JSON.parse(raw) } catch { /* no-JSON */ }
      if (!res.ok) { setEditError(data.error || `Error ${res.status}`); setSavingUser(false); return }
      setEditUser(null)
      load()
    } catch (err) {
      setEditError(`No se pudo conectar: ${err instanceof Error ? err.message : 'error'}`)
    }
    setSavingUser(false)
  }

  if (loading) return <div style={{ padding: '24px', color: 'var(--text-muted)' }}>Cargando...</div>

  if (!isAdmin) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
        <i className="ti ti-lock" style={{ fontSize: '40px', opacity: 0.4, display: 'block', marginBottom: '12px' }}></i>
        <p>Solo los administradores pueden gestionar usuarios y permisos.</p>
      </div>
    </div>
  )

  const tabStyle = (t: string): React.CSSProperties => ({
    padding: '8px 16px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
    color: tab === t ? 'var(--accent)' : 'var(--text-muted)',
    borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
    marginBottom: '-1px', background: 'none', border: 'none', fontFamily: 'inherit',
    borderBottomStyle: 'solid' as const,
  })

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.8.0/tabler-icons.min.css" />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Usuarios y permisos</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => { setShowNewUser(true); setCreateError('') }} style={{
            padding: '7px 14px', background: 'var(--accent)', border: 'none',
            borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
            color: 'white', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <i className="ti ti-user-plus" aria-hidden="true"></i>
            Nuevo usuario
          </button>
          <button onClick={() => { setShowImport(true); setImportRows([]); setImportPreview(null); setImportMsg('') }} style={{
            padding: '7px 14px', background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
            color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <i className="ti ti-upload" aria-hidden="true"></i>
            Importar CSV
          </button>
          <button onClick={exportUsersCSV} style={{
            padding: '7px 14px', background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
            color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <i className="ti ti-download" aria-hidden="true"></i>
            Exportar CSV
          </button>
          <button onClick={syncUsers} disabled={syncing} style={{
            padding: '7px 14px', background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
            color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px',
            opacity: syncing ? 0.6 : 1,
          }}>
            <i className="ti ti-refresh" aria-hidden="true"></i>
            {syncing ? 'Sincronizando...' : 'Sincronizar usuarios'}
          </button>
        </div>
      </div>

      {syncMsg && (
        <div className="alert alert-success" style={{ padding: '10px 14px', borderRadius: '8px', fontSize: '12px', marginBottom: '16px' }}>
          {syncMsg}
        </div>
      )}

      {/* Info sobre sincronización */}
      <div style={{ padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <i className="ti ti-info-circle" style={{ fontSize: '15px', flexShrink: 0 }} aria-hidden="true"></i>
        <span>
          Si un usuario puede loguearse pero no aparece acá, ejecutá este SQL en Supabase y presioná &quot;Sincronizar usuarios&quot;:
          <br />
          <code style={{ fontSize: '11px', background: 'var(--hover-bg)', padding: '2px 6px', borderRadius: '4px', marginTop: '4px', display: 'inline-block' }}>
            insert into public.profiles (id, full_name, global_role) select id, coalesce(raw_user_meta_data-&gt;&gt;&apos;full_name&apos;, email), coalesce(raw_user_meta_data-&gt;&gt;&apos;global_role&apos;, &apos;teacher&apos;) from auth.users where id not in (select id from public.profiles) on conflict (id) do nothing;
          </code>
        </span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '20px' }}>
        <button style={tabStyle('by-course')} onClick={() => setTab('by-course')}>Permisos de este curso</button>
        <button style={tabStyle('by-user')}   onClick={() => setTab('by-user')}>Todos los usuarios</button>
      </div>

      {/* TAB: Permisos del curso */}
      {tab === 'by-course' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
          {permissions.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No hay permisos asignados a este curso todavía.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--hover-bg)' }}>
                  {['Usuario','Comisión','Permiso',''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 16px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {permissions.map(p => {
                  const u = p.profiles as Profile | null
                  const com = p.commission_id ? commissions.find(c => c.id === p.commission_id) : null
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {u && (
                            <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: getColor(u.id), color: 'white', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {getInitials(u.full_name)}
                            </div>
                          )}
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 500 }}>{u?.full_name || p.user_id}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{u?.global_role === 'admin' ? 'Administrador' : u?.global_role === 'teacher' ? 'Docente' : 'Invitado'}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: '13px', color: 'var(--text-muted)' }}>
                        {com ? <span className="badge badge-success" style={{ fontSize: '11px' }}>{com.name}</span> : <span style={{ color: 'var(--text-muted)' }}>Todas</span>}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <select value={p.permission} onChange={e => changePerm(p.id, e.target.value)}
                          style={{ padding: '4px 8px', border: '1px solid var(--input-border)', borderRadius: '6px', fontSize: '12px', fontFamily: 'inherit' }}>
                          <option value="full">full</option>
                          <option value="edit">edit</option>
                          <option value="read">read</option>
                        </select>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <button onClick={() => removePerm(p.id)} style={{ background: 'none', border: '1px solid var(--badge-danger-bd)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: 'var(--danger)', fontSize: '12px' }}>
                          <i className="ti ti-trash" aria-hidden="true"></i>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* TAB: Todos los usuarios */}
      {tab === 'by-user' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '4px 20px' }}>
          <div style={{ padding: '14px 0 10px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ position: 'relative' }}>
              <i className="ti ti-search" aria-hidden="true" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '14px' }}></i>
              <input
                type="text"
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                placeholder="Buscar por nombre o rol..."
                style={{ width: '100%', padding: '8px 10px 8px 32px', border: '1px solid var(--input-border)', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }}
              />
            </div>
          </div>

          {/* Barra de asignación masiva de permisos (solo admin) */}
          {isAdmin && (
            <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <button onClick={() => { setBulkMode(!bulkMode); setBulkSelected(new Set()); setBulkMsg('') }}
                style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  border: `1px solid ${bulkMode ? 'var(--accent)' : 'var(--border)'}`,
                  background: bulkMode ? 'var(--chip-accent-bg)' : 'var(--surface)',
                  color: bulkMode ? 'var(--chip-accent-fg)' : 'var(--text-muted)' }}>
                <i className="ti ti-checkbox" aria-hidden="true" style={{ marginRight: '6px' }}></i>
                {bulkMode ? 'Cancelar selección' : 'Asignar permisos en masa'}
              </button>
              {bulkMode && (
                <>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{bulkSelected.size} seleccionado(s) · permiso en <strong>este curso</strong>:</span>
                  <select value={bulkPerm} onChange={e => setBulkPerm(e.target.value as 'read'|'edit')}
                    style={{ padding: '6px 10px', border: '1px solid var(--input-border)', borderRadius: '8px', fontSize: '12px', fontFamily: 'inherit' }}>
                    <option value="read">Lectura (read)</option>
                    <option value="edit">Edición (edit)</option>
                  </select>
                  <button onClick={applyBulk} disabled={bulkBusy || bulkSelected.size === 0}
                    style={{ padding: '6px 14px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: (bulkBusy || bulkSelected.size === 0) ? 0.5 : 1 }}>
                    {bulkBusy ? 'Aplicando...' : 'Aplicar'}
                  </button>
                </>
              )}
              {bulkMsg && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{bulkMsg}</span>}
            </div>
          )}
          {allProfiles.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No hay usuarios en el sistema. Sincronizá para traerlos.
            </div>
          ) : filteredProfiles.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Ningún usuario coincide con &quot;{userSearch}&quot;.
            </div>
          ) : filteredProfiles.map(u => {
            const userPerms = permissions.filter(p => p.user_id === u.id)
            const permCls: Record<string, string> = { full: 'badge-accent', edit: 'badge-info', read: 'badge-neutral' }
            return (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                {bulkMode && (
                  <input type="checkbox" checked={bulkSelected.has(u.id)} onChange={() => toggleBulk(u.id)}
                    style={{ width: '16px', height: '16px', cursor: 'pointer', flexShrink: 0 }} />
                )}
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: getColor(u.id), color: 'white', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {getInitials(u.full_name)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: '13px' }}>{u.full_name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {u.email ? u.email : (u.global_role === 'admin' ? 'Administrador' : u.global_role === 'teacher' ? 'Docente' : 'Invitado')}
                  </div>
                </div>
                <button onClick={() => openEditUser(u)} title="Editar usuario" style={{
                  background: 'none', border: '1px solid var(--border)', borderRadius: '6px',
                  padding: '4px 8px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '12px', flexShrink: 0,
                }}>
                  <i className="ti ti-pencil" aria-hidden="true"></i>
                </button>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {userPerms.length === 0 ? (
                    <>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Sin acceso a este curso</span>
                      <button onClick={() => addPermission(u.id)} className="chip-accent" style={{
                        marginLeft: '8px', padding: '3px 10px', fontSize: '11px', borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit',
                      }}>
                        + Dar acceso
                      </button>
                    </>
                  ) : userPerms.map(p => {
                    const com = p.commission_id ? commissions.find(c => c.id === p.commission_id) : null
                    const pc = permCls[p.permission] || permCls.read
                    return (
                      <span key={p.id} className={`badge ${pc}`} style={{ fontSize: '10px' }}>
                        {com?.name || 'Todas'} · {p.permission}
                      </span>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal: Nuevo usuario (alta manual) */}
      {showNewUser && (
        <div onClick={() => !creating && setShowNewUser(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: '12px', width: '440px', maxWidth: '100%', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Nuevo usuario</h3>
            </div>
            <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {createError && (
                <div className="alert alert-danger" style={{ padding: '8px 12px', borderRadius: '8px', fontSize: '12px' }}>{createError}</div>
              )}
              <div style={{ display: 'flex', gap: '10px' }}>
                <label style={{ flex: 1, fontSize: '12px', color: 'var(--text-muted)' }}>Nombre *
                  <input value={newUser.first_name} onChange={e => setNewUser({ ...newUser, first_name: e.target.value })}
                    style={{ width: '100%', marginTop: '4px', padding: '8px 10px', border: '1px solid var(--input-border)', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }} />
                </label>
                <label style={{ flex: 1, fontSize: '12px', color: 'var(--text-muted)' }}>Apellido *
                  <input value={newUser.last_name} onChange={e => setNewUser({ ...newUser, last_name: e.target.value })}
                    style={{ width: '100%', marginTop: '4px', padding: '8px 10px', border: '1px solid var(--input-border)', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }} />
                </label>
              </div>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Email *
                <input type="email" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                  style={{ width: '100%', marginTop: '4px', padding: '8px 10px', border: '1px solid var(--input-border)', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }} />
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <label style={{ flex: 1, fontSize: '12px', color: 'var(--text-muted)' }}>DNI *
                  <input value={newUser.dni} onChange={e => setNewUser({ ...newUser, dni: e.target.value })}
                    style={{ width: '100%', marginTop: '4px', padding: '8px 10px', border: '1px solid var(--input-border)', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }} />
                </label>
                <label style={{ flex: 1, fontSize: '12px', color: 'var(--text-muted)' }}>Contraseña * (mín. 8)
                  <input type="password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                    style={{ width: '100%', marginTop: '4px', padding: '8px 10px', border: '1px solid var(--input-border)', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <label style={{ flex: 1, fontSize: '12px', color: 'var(--text-muted)' }}>Estado
                  <select value={newUser.status} onChange={e => setNewUser({ ...newUser, status: e.target.value })}
                    style={{ width: '100%', marginTop: '4px', padding: '8px 10px', border: '1px solid var(--input-border)', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }}>
                    <option value="activo">Activo</option>
                    <option value="pendiente">Pendiente</option>
                    <option value="inactivo">Inactivo</option>
                  </select>
                </label>
                <label style={{ flex: 1, fontSize: '12px', color: 'var(--text-muted)' }}>Rol global
                  <select value={newUser.global_role} onChange={e => setNewUser({ ...newUser, global_role: e.target.value })}
                    style={{ width: '100%', marginTop: '4px', padding: '8px 10px', border: '1px solid var(--input-border)', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }}>
                    <option value="teacher">Sin rol global</option>
                    <option value="guest">Lectura global</option>
                    <option value="admin">Administrador</option>
                  </select>
                </label>
              </div>
            </div>
            <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setShowNewUser(false)} disabled={creating} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-muted)' }}>Cancelar</button>
              <button onClick={submitNewUser} disabled={creating} style={{ padding: '8px 16px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: creating ? 0.6 : 1 }}>{creating ? 'Creando...' : 'Crear usuario'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Importar CSV */}
      {showImport && (
        <div onClick={() => !importing && setShowImport(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: '12px', width: '560px', maxWidth: '100%', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Importar usuarios desde CSV</h3>
            </div>
            <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                El archivo debe tener los encabezados: <code style={{ background: 'var(--hover-bg)', padding: '2px 6px', borderRadius: '4px' }}>nombre,apellido,email,dni,password</code>
              </div>
              <input type="file" accept=".csv,text/csv" onChange={handleCSVFile}
                style={{ fontSize: '13px', fontFamily: 'inherit' }} />

              {importRows.length > 0 && (
                <div style={{ fontSize: '13px' }}>
                  {importRows.length} fila(s) leída(s).
                  {importPreview && importPreview.length === 0 && (
                    <span className="badge badge-success" style={{ marginLeft: '8px' }}>Sin errores, listo para importar</span>
                  )}
                </div>
              )}

              {importPreview && importPreview.length > 0 && (
                <div className="alert alert-danger" style={{ flexDirection: 'column', padding: '10px 12px', borderRadius: '8px', fontSize: '12px', gap: '4px' }}>
                  <strong>Errores que impiden importar:</strong>
                  {importPreview.map(e => (
                    <div key={e.row}>Fila {e.row}: {e.errors.join(' ')}</div>
                  ))}
                </div>
              )}

              {importMsg && (
                <div className="alert alert-info" style={{ padding: '10px 12px', borderRadius: '8px', fontSize: '12px' }}>{importMsg}</div>
              )}
            </div>
            <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setShowImport(false)} disabled={importing} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-muted)' }}>Cerrar</button>
              <button onClick={commitImport} disabled={importing || importRows.length === 0 || (importPreview != null && importPreview.length > 0)}
                style={{ padding: '8px 16px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: (importing || importRows.length === 0 || (importPreview != null && importPreview.length > 0)) ? 0.5 : 1 }}>
                {importing ? 'Importando...' : 'Importar'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal: Editar usuario */}
      {editUser && (
        <div onClick={() => !savingUser && setEditUser(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: '12px', width: '440px', maxWidth: '100%', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Editar usuario</h3>
            </div>
            <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {editError && (
                <div className="alert alert-danger" style={{ padding: '8px 12px', borderRadius: '8px', fontSize: '12px' }}>{editError}</div>
              )}
              <div style={{ display: 'flex', gap: '10px' }}>
                <label style={{ flex: 1, fontSize: '12px', color: 'var(--text-muted)' }}>Nombre *
                  <input value={editUser.first_name} onChange={e => setEditUser({ ...editUser, first_name: e.target.value })}
                    style={{ width: '100%', marginTop: '4px', padding: '8px 10px', border: '1px solid var(--input-border)', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }} />
                </label>
                <label style={{ flex: 1, fontSize: '12px', color: 'var(--text-muted)' }}>Apellido *
                  <input value={editUser.last_name} onChange={e => setEditUser({ ...editUser, last_name: e.target.value })}
                    style={{ width: '100%', marginTop: '4px', padding: '8px 10px', border: '1px solid var(--input-border)', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }} />
                </label>
              </div>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Email *
                <input type="email" value={editUser.email} onChange={e => setEditUser({ ...editUser, email: e.target.value })}
                  style={{ width: '100%', marginTop: '4px', padding: '8px 10px', border: '1px solid var(--input-border)', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }} />
              </label>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>DNI *
                <input value={editUser.dni} onChange={e => setEditUser({ ...editUser, dni: e.target.value })}
                  style={{ width: '100%', marginTop: '4px', padding: '8px 10px', border: '1px solid var(--input-border)', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }} />
              </label>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Nueva contraseña (dejar vacío para no cambiar)
                <input type="password" value={editUser.password} onChange={e => setEditUser({ ...editUser, password: e.target.value })} placeholder="mín. 8 caracteres"
                  style={{ width: '100%', marginTop: '4px', padding: '8px 10px', border: '1px solid var(--input-border)', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }} />
              </label>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Rol global
                <select value={editUser.global_role} onChange={e => setEditUser({ ...editUser, global_role: e.target.value })}
                  style={{ width: '100%', marginTop: '4px', padding: '8px 10px', border: '1px solid var(--input-border)', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }}>
                  <option value="teacher">Docente (sin acceso global, solo cursos asignados)</option>
                  <option value="guest">Invitado / Lectura global (ve todos los cursos, solo lee)</option>
                  <option value="admin">Administrador (control total)</option>
                </select>
              </label>
            </div>
            <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setEditUser(null)} disabled={savingUser} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-muted)' }}>Cancelar</button>
              <button onClick={saveEditUser} disabled={savingUser} style={{ padding: '8px 16px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: savingUser ? 0.6 : 1 }}>{savingUser ? 'Guardando...' : 'Guardar cambios'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
