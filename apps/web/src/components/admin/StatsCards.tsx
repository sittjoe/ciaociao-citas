import { cn } from '@/lib/utils'
import type { AdminStats } from '@/types'
import { StatusBadge } from '@/components/ui/Badge'
import { formatShortDate } from '@/lib/utils'

export function StatsCards({ stats }: { stats: AdminStats }) {
  const cards = [
    { label: 'Pendientes',       value: stats.totalPending,   color: 'text-amber-600'    },
    { label: 'Confirmadas hoy',  value: stats.acceptedToday,  color: 'text-emerald-600'  },
    { label: 'Total confirmadas',value: stats.totalAccepted,  color: 'text-champagne'    },
    { label: 'Slots disponibles',value: stats.upcomingSlots,  color: 'text-blue-600'     },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(card => (
        <div key={card.label} className="card-soft flex flex-col gap-1">
          <p className="text-xs text-ink-muted tracking-widest uppercase font-semibold">{card.label}</p>
          <p className={cn('text-3xl font-bold font-serif', card.color)}>{card.value}</p>
        </div>
      ))}
    </div>
  )
}

export function UpcomingList({ appointments }: { appointments: AdminStats['nextAppointments'] }) {
  if (!appointments.length) {
    return <p className="text-sm text-ink-muted py-4 text-center">Sin citas próximas</p>
  }

  return (
    <div className="space-y-2">
      {appointments.map(appt => (
        <div
          key={appt.id}
          className="flex items-center justify-between p-3 bg-cream-soft rounded-xl border border-stone-100"
        >
          <div className="min-w-0">
            <p className="text-sm text-ink font-medium truncate">{appt.name}</p>
            <p className="text-xs text-ink-muted">{formatShortDate(appt.slotDatetime)}</p>
          </div>
          <StatusBadge status={appt.status} />
        </div>
      ))}
    </div>
  )
}
