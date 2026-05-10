import type { Metadata } from 'next'
import dynamic from 'next/dynamic'

export const metadata: Metadata = { title: 'Calendario' }

const AdminCalendar = dynamic(
  () => import('@/components/admin/AdminCalendar').then(m => ({ default: m.AdminCalendar })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[600px] animate-pulse rounded-2xl bg-admin-surface border border-admin-line" />
    ),
  }
)

export default function CalendarioPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="h-eyebrow mb-2">Vista de calendario</p>
        <h1 className="font-serif text-2xl text-ink">Calendario</h1>
        <p className="text-sm text-ink-muted mt-1">
          Visualiza y gestiona todas las citas. Haz clic en cualquier evento para ver detalles.
        </p>
      </div>
      <AdminCalendar />
    </div>
  )
}
