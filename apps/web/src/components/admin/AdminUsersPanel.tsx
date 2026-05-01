'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ShieldCheck, UserMinus, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface AdminUser {
  uid: string
  email: string
  displayName?: string
  active: boolean
}

export function AdminUsersPanel() {
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

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
        toast.success(`Admin creado. Contraseña temporal: ${data.tempPassword}`, { duration: 15000 })
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

  const deactivate = async (uid: string) => {
    try {
      const res = await fetch(`/api/admin/users?uid=${encodeURIComponent(uid)}`, { method: 'DELETE' })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'No se pudo desactivar')
      toast.success('Admin desactivado')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo desactivar')
    }
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
            className="input-clean"
            placeholder="admin@ciaociao.mx"
            required
          />
        </div>
        <Button type="submit" loading={saving}>
          <UserPlus size={15} /> Agregar admin
        </Button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-stone-100 bg-white">
        {loading ? (
          <p className="px-5 py-8 text-center text-sm text-ink-muted">Cargando admins...</p>
        ) : admins.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-muted">
            No hay admins en Firestore. Los correos en `ADMIN_BOOTSTRAP_EMAILS` pueden entrar y crear el primer registro.
          </p>
        ) : (
          <div className="divide-y divide-stone-100">
            {admins.map(admin => (
              <div key={admin.uid} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink truncate">
                    <ShieldCheck size={15} className={admin.active ? 'text-emerald-600' : 'text-stone-300'} />
                    {admin.email}
                  </p>
                  <p className="text-xs text-ink-subtle mt-1">{admin.active ? 'Activo' : 'Inactivo'}</p>
                </div>
                {admin.active && (
                  <Button variant="outline" size="sm" onClick={() => deactivate(admin.uid)}>
                    <UserMinus size={14} /> Desactivar
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
