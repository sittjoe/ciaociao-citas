import type { Metadata } from 'next'
import { AppointmentTable } from '@/components/admin/AppointmentTable'

export const metadata: Metadata = { title: 'Citas' }

export default function CitasPage() {
  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="font-serif text-2xl text-gold-400">Citas</h1>
        <p className="text-sm text-gold-700 mt-1">Gestiona las solicitudes de visita</p>
      </div>
      <AppointmentTable />
    </div>
  )
}
