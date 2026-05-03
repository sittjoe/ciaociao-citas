import type { Metadata } from 'next'
import { SlotManager } from '@/components/admin/SlotManager'

export const metadata: Metadata = { title: 'Slots' }

export default function SlotsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="h-eyebrow mb-2">Agenda</p>
        <h1 className="font-serif text-2xl text-ink">Slots</h1>
        <p className="text-sm text-ink-muted mt-1">Crea y gestiona los horarios disponibles para visitas.</p>
      </div>
      <SlotManager />
    </div>
  )
}
