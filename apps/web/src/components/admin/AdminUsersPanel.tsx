'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ShieldCheck, UserMinus, UserPlus, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { AlertDialog } from '@/components/ui/AlertDialog'
import { Skeleton } from '@/components/ui/Skeleton'

interface AdminUser {
  uid:          string
  email:        string
  displayName?: string
  active:       boolean
}

function InitialsAvatar({ email }: { email: string }) {
  const initials = email
    .split('@')[0]
    .split(/[._-]/)
    .slice(0, 2)
    .map(s => s[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <span className="w-8 h-8 rounded-full bg-champagne-soft border border-champagne-soft/60 flex items-center justify-center text-xs font-semibold text-champagne-deep shrink-0">
      {initials}
    </span>
  )
}

export function AdminUsersPanel() {
  const [admins,   setAdmins]   = useState<AdminUser[]>([])
  const [email,    setEmail]    = useState('')
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)

  const [tempPassword,   setTempPassword]   = useState<string | null>(null)
  const [deactivateUid,  setDeactivateUid]  = useState<string | null>(null)
  const [deactivating,   setDeactivating]   = useState(false)
  const [copied,         setCopied]         = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/users')
      if (!res.ok) throw new Error()
      const data = await res.json() as { admins: AdminUser[] }
      setAdmins(data.admins)
    } catch {
      toast.error('Error al cargar admins')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const addAdmin = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json() as { error?: string; tempPassword?: string }
      if (!res.ok) throw new Error(data.error ?? 'No se pudo agregar')
      setEmail('')
      if (data.tempPassword) {
        setTempPassword(data.tempPassword)
      } else {
        toast.success('Admin agregado')
      }
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo agregar')
    } finally {
      setSaving(false)
    }
  }

  const confirmDeactivate = async () => {
    if (!deactivateUid) return
    setDeactivating(true)
    try {
      const res = await fetch(`/api/admin/users?uid=${encodeURIComponent(deactivateUid)}`, { method: 'DELETE' })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'No se pudo desactivar')
      toast.success('Admin desactivado')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo desactivar')
    } finally {
      setDeactivating(false)
      setDeactivateUid(null)
    }
  }

  const copyPassword = async () => {
    if (!tempPassword) return
    await navigator.clipboard.writeText(tempPassword)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-5">
      <form onSubmit={addAdmin} className="card-soft flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1">
          <label className="label-clean">Email de Firebase Auth</label>
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            type="email"
            className="input-clean mt-1"
            placeholder="admin@ciaociao.mx"
            required
          />
        </div>
        <Button type="submit" loading={saving}>
          <UserPlus size={15} strokeWidth={1.5} /> Agregar admin
        </Button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-ink-line bg-white">
        {loading ? (
          <div className="p-5 space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="w-8 h-8" rounded />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-48" />
                  <Skeleton className="h-2.5 w-16" />
                </div>
              </div>
            ))}
          </div>
        ) : admins.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-muted italic">
            No hay admins. Los correos en <code className="text-xs bg-cream-soft px-1 rounded">ADMIN_BOOTSTRAP_EMAILS</code> pueden crear el primer registro.
          </p>
        ) : (
          <div className="divide-y divide-ink-line">
            {admins.map(admin => (
              <div key={admin.uid} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4">
                <div className="flex items-center gap-3 min-w-0">
                  <InitialsAvatar email={admin.email} />
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-ink truncate">
                      <ShieldCheck size={14} strokeWidth={1.5} className={admin.active ? 'text-emerald-600' : 'text-ink-subtle'} />
                      {admin.email}
                    </p>
                    <p className="text-xs text-ink-subtle mt-0.5">{admin.active ? 'Activo' : 'Inactivo'}</p>
                  </div>
                </div>
                {admin.active && (
                  <Button variant="outline" size="sm" onClick={() => setDeactivateUid(admin.uid)}>
                    <UserMinus size={14} strokeWidth={1.5} /> Desactivar
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Temp password modal */}
      <Modal
        open={!!tempPassword}
        onClose={() => setTempPassword(null)}
        title="Admin creado"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            Comparte esta contraseña temporal con el nuevo admin. Desaparecerá al cerrar.
          </p>
          <div className="flex items-center gap-2 bg-cream-soft border border-ink-line rounded-xl px-4 py-3">
            <code className="flex-1 text-sm font-mono text-ink tracking-wider select-all">{tempPassword}</code>
            <button
              onClick={copyPassword}
              className="text-ink-muted hover:text-champagne transition-colors p-1 rounded"
              aria-label="Copiar contraseña"
            >
              {copied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
            </button>
          </div>
          <Button className="w-full" onClick={() => setTempPassword(null)}>
            Listo
          </Button>
        </div>
      </Modal>

      {/* Deactivate confirm */}
      <AlertDialog
        open={!!deactivateUid}
        title="¿Desactivar este admin?"
        description="El admin perderá acceso al panel inmediatamente."
        confirmLabel="Sí, desactivar"
        cancelLabel="Cancelar"
        variant="warning"
        loading={deactivating}
        onConfirm={confirmDeactivate}
        onCancel={() => setDeactivateUid(null)}
      />
    </div>
  )
}
