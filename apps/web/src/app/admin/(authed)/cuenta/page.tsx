'use client'

import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { cn } from '@/lib/utils'

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: '', color: '' }
  let score = 0
  if (pw.length >= 8)  score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 1) return { score, label: 'Débil',    color: 'bg-red-400' }
  if (score <= 3) return { score, label: 'Regular',  color: 'bg-amber-400' }
  return              { score, label: 'Fuerte',    color: 'bg-emerald-500' }
}

export default function CuentaPage() {
  const router = useRouter()

  const [password,        setPassword]        = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword,  setSavingPassword]  = useState(false)

  const [newEmail,     setNewEmail]     = useState('')
  const [savingEmail,  setSavingEmail]  = useState(false)

  const strength = useMemo(() => passwordStrength(password), [password])
  const mismatch = confirmPassword.length > 0 && password !== confirmPassword

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
    <div className="space-y-8 max-w-2xl">
      <div>
        <p className="h-eyebrow mb-2">Seguridad</p>
        <h1 className="font-serif text-display-sm font-light text-ink">Mi cuenta</h1>
        <p className="text-sm text-ink-muted mt-1">Actualiza tus credenciales de acceso al panel.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
      <form onSubmit={changePassword}>
        <Card variant="admin" className="p-6 space-y-5">
          <h2 className="h-eyebrow text-ink">Cambiar contraseña</h2>

          <Field label="Nueva contraseña" required>
            {id => (
              <Input
                id={id}
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                minLength={8}
                required
                autoComplete="new-password"
                className="mt-1"
              />
            )}
          </Field>

          {/* Password strength bar */}
          {password.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(i => (
                  <div
                    key={i}
                    className={cn(
                      'h-1 flex-1 rounded-full transition-all duration-300',
                      i <= strength.score ? strength.color : 'bg-ink-line',
                    )}
                  />
                ))}
              </div>
              {strength.label && (
                <p className="text-xs text-ink-muted">{strength.label}</p>
              )}
            </div>
          )}

          <Field label="Confirmar contraseña" error={mismatch ? 'Las contraseñas no coinciden' : undefined} required>
            {id => (
              <Input
                id={id}
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                error={mismatch}
                minLength={8}
                required
                autoComplete="new-password"
                className="mt-1"
              />
            )}
          </Field>

          <Button type="submit" loading={savingPassword} disabled={mismatch}>
            Guardar contraseña
          </Button>
        </Card>
      </form>

      <form onSubmit={changeEmail}>
        <Card variant="admin" className="p-6 space-y-5">
          <h2 className="h-eyebrow text-ink">Cambiar email</h2>
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Al guardar, tu sesión se cerrará y deberás iniciar sesión con el nuevo email.
          </p>

          <Field label="Nuevo email" required>
            {id => (
              <Input
                id={id}
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="nuevo@ciaociao.mx"
                className="mt-1"
              />
            )}
          </Field>

          <Button type="submit" loading={savingEmail} variant="outline">
            Guardar email
          </Button>
        </Card>
      </form>
      </div>
    </div>
  )
}
