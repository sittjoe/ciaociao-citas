'use client'

import Link from 'next/link'
import { CalendarCheck, Clock, Gem, XCircle, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AdminStats } from '@/types'
import { StatusBadge } from '@/components/ui/Badge'
import { formatShortDate } from '@/lib/utils'
import { NumberRoll } from '@/components/motion'
import { Card } from '@/components/ui/Card'

const cards = (stats: AdminStats) => [
  { label: 'Pendientes',         value: stats.totalPending,   color: 'text-amber-600',      Icon: Clock        },
  { label: 'Confirmadas hoy',    value: stats.acceptedToday,  color: 'text-emerald-600',    Icon: CalendarCheck },
  { label: 'Total confirmadas',  value: stats.totalAccepted,  color: 'text-champagne-deep', Icon: Gem           },
  { label: 'Rechazadas',         value: stats.totalRejected,  color: 'text-red-500',        Icon: XCircle      },
  { label: 'Slots próx. semana', value: stats.upcomingSlots,  color: 'text-blue-600',       Icon: CalendarDays  },
]

export function StatsCards({ stats }: { stats: AdminStats }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      {cards(stats).map(({ label, value, color, Icon }) => (
        <Card key={label} variant="soft" className="p-5 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <p className="h-eyebrow truncate">{label}</p>
            <Icon size={16} strokeWidth={1.5} className={cn(color, 'shrink-0')} />
          </div>
          <NumberRoll
            value={value}
            className={cn('text-display-sm font-light font-serif tabular-nums', color)}
          />
        </Card>
      ))}
    </div>
  )
}

export function UpcomingList({ appointments }: { appointments: AdminStats['nextAppointments'] }) {
  if (!appointments.length) {
    return (
      <p className="text-sm text-ink-muted py-6 text-center italic">Sin citas próximas</p>
    )
  }

  return (
    <div className="space-y-2">
      {appointments.map(appt => (
        <Link
          key={appt.id}
          href="/admin/citas"
          className="flex items-center justify-between p-3 bg-cream-soft rounded-xl border border-ink-line hover:border-champagne-soft transition-colors focus-visible:outline-none focus-visible:shadow-focus-ring"
        >
          <div className="min-w-0">
            <p className="text-sm text-ink font-medium truncate">{appt.name}</p>
            <p className="text-xs text-ink-muted">{formatShortDate(appt.slotDatetime)}</p>
          </div>
          <StatusBadge status={appt.status} />
        </Link>
      ))}
    </div>
  )
}
