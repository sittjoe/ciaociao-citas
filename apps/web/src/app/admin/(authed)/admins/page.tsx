import type { Metadata } from 'next'
import { AdminUsersPanel } from '@/components/admin/AdminUsersPanel'

export const metadata: Metadata = { title: 'Admins' }

export default function AdminsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="h-eyebrow mb-2">Accesos</p>
        <h1 className="font-serif text-2xl text-ink">Admins</h1>
        <p className="text-sm text-ink-muted mt-1">Gestiona quién puede entrar al panel de Ciao Ciao.</p>
      </div>
      <AdminUsersPanel />
    </div>
  )
}
