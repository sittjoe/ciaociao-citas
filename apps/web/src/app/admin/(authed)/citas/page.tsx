import type { Metadata } from 'next'
import { AppointmentTable } from '@/components/admin/AppointmentTable'

export const metadata: Metadata = { title: 'Citas' }

export default function CitasPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="h-eyebrow mb-2">Mesa de trabajo</p>
        <h1 className="font-serif text-2xl text-ink">Citas</h1>
        <p className="text-sm text-ink-muted mt-1">Gestiona solicitudes, identificaciones, invitados y calendario.</p>
      </div>
      <AppointmentTable />
    </div>
  )
}
