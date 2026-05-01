'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'

export default function CuentaPage() {
  const router = useRouter()

  const [password, setPassword]           = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword]   = useState(false)

  const [newEmail, setNewEmail]     = useState('')
  const [savingEmail, setSavingEmail] = useState(false)

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      toast.error('Las contraseñas no coinciden')
      return
    }
    setSavingPassword(true)
    try {
      const res = await fetch('/api/admin/credentials/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error')
      toast.success('Contraseña actualizada')
      setPassword('')
      setConfirmPassword('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo actualizar')
    } finally {
      setSavingPassword(false)
    }
  }

  const changeEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingEmail(true)
    try {
      const res = await fetch('/api/admin/credentials/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error')
      toast.success('Email actualizado. Inicia sesión nuevamente.')
      router.push('/admin/login')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo actualizar')
    } finally {
      setSavingEmail(false)
    }
  }

  return (
    <div className="space-y-8 max-w-lg">
      <div>
        <h1 className="font-serif text-2xl text-ink">Mi cuenta</h1>
        <p className="text-sm text-ink-muted mt-1">Actualiza tus credenciales de acceso al panel.</p>
      </div>

      <form onSubmit={changePassword} className="card-soft space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-ink">Cambiar contraseña</h2>
        <div>
          <label className="label-clean">Nueva contraseña</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="input-clean"
            minLength={8}
            required
            autoComplete="new-password"
          />
        </div>
        <div>
          <label className="label-clean">Confirmar contraseña</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            className="input-clean"
            minLength={8}
            required
            autoComplete="new-password"
          />
        </div>
        <Button type="submit" loading={savingPassword}>Guardar contraseña</Button>
      </form>

      <form onSubmit={changeEmail} className="card-soft space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-ink">Cambiar email</h2>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Al guardar, tu sesión se cerrará y deberás iniciar sesión con el nuevo email.
        </p>
        <div>
          <label className="label-clean">Nuevo email</label>
          <input
            type="email"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            className="input-clean"
            required
            autoComplete="email"
          />
        </div>
        <Button type="submit" loading={savingEmail} variant="outline">Guardar email</Button>
      </form>
    </div>
  )
}
