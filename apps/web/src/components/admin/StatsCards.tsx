'use client'

import Link from 'next/link'
import { CalendarCheck, Clock, Gem, XCircle, CalendarDays, CalendarClock, CheckCircle, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AdminStats, CommercialStatus } from '@/types'
import { StatusBadge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { commercialStatusLabels } from '@/lib/commercial'
import { formatShortDate } from '@/lib/utils'
import { NumberRoll } from '@/components/motion'
import { Card } from '@/components/ui/Card'

function reload() {
  if (typeof window !== 'undefined') window.location.reload()
}

// Paleta disciplinada: champagne = acento; ámbar/esmeralda = semáforos con
// significado (falta algo / positivo); el resto en tinta. Nada de azul suelto
// ni cinco colores compitiendo (eso sería "dashboard cripto"). Los tonos de
// texto usan -700 para pasar contraste sobre superficies claras.
const cards = (stats: AdminStats) => [
  { label: 'Pendientes',         value: stats.totalPending,   num: 'text-amber-700',      icon: 'text-amber-600',    Icon: Clock        },
  { label: 'Confirmadas hoy',    value: stats.acceptedToday,  num: 'text-emerald-700',    icon: 'text-emerald-600',  Icon: CalendarCheck },
  { label: 'Total confirmadas',  value: stats.totalAccepted,  num: 'text-champagne-deep', icon: 'text-champagne',    Icon: Gem           },
  { label: 'Rechazadas',         value: stats.totalRejected,  num: 'text-ink',            icon: 'text-ink-subtle',   Icon: XCircle      },
  { label: 'Slots próx. semana', value: stats.upcomingSlots,  num: 'text-ink',            icon: 'text-ink-subtle',   Icon: CalendarDays  },
]

export function StatsCards({ stats }: { stats: AdminStats }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {cards(stats).map(({ label, value, num, icon, Icon }) => (
        <Card key={label} variant="admin" className="flex flex-col gap-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="h-eyebrow truncate">{label}</p>
            <Icon size={16} strokeWidth={1.5} className={cn(icon, 'shrink-0')} />
          </div>
          <NumberRoll
            value={value}
            className={cn('font-serif text-3xl font-light tabular-nums leading-none', num)}
          />
        </Card>
      ))}
    </div>
  )
}

export function UpcomingList({
  appointments,
  error = false,
}: {
  appointments: AdminStats['nextAppointments']
  error?: boolean
}) {
  if (error) {
    return (
      <EmptyState
        icon={<AlertTriangle size={32} strokeWidth={1.25} />}
        title="No se pudo cargar"
        description="Hubo un problema al traer las próximas citas."
        action={{ label: 'Reintentar', onClick: reload }}
      />
    )
  }

  if (!appointments.length) {
    return (
      <EmptyState
        icon={<CalendarClock size={32} strokeWidth={1.25} />}
        title="Sin citas próximas"
        description="Las próximas citas confirmadas o por decidir aparecerán aquí."
      />
    )
  }

  return (
    <div className="space-y-2">
      {appointments.map(appt => (
        <Link
          key={appt.id}
          href={`/admin/citas?open=${appt.id}`}
          aria-label={`Ver cita de ${appt.name} · ${formatShortDate(appt.slotDatetime)}`}
          className="flex min-h-[3.25rem] items-center justify-between gap-3 rounded-xl border border-ink-line bg-cream-soft p-3 transition-colors hover:border-champagne-soft focus-visible:outline-none focus-visible:shadow-focus-ring"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{appt.name}</p>
            <p className="text-xs text-ink-muted">{formatShortDate(appt.slotDatetime)}</p>
          </div>
          <StatusBadge status={appt.status} />
        </Link>
      ))}
    </div>
  )
}

export type OverdueFollowUpItem = {
  id: string
  name: string
  followUpAt: Date
  commercialStatus?: CommercialStatus
}

export function OverdueFollowUpsList({
  items,
  error = false,
}: {
  items: OverdueFollowUpItem[]
  error?: boolean
}) {
  if (error) {
    return (
      <EmptyState
        icon={<AlertTriangle size={32} strokeWidth={1.25} />}
        title="No se pudo cargar"
        description="Hubo un problema al traer los seguimientos."
        action={{ label: 'Reintentar', onClick: reload }}
      />
    )
  }

  if (!items.length) {
    return (
      <EmptyState
        icon={<CheckCircle size={32} strokeWidth={1.25} />}
        title="Todo al día"
        description="No hay seguimientos vencidos por ahora."
      />
    )
  }

  return (
    <div className="space-y-2">
      {items.map(item => (
        <Link
          key={item.id}
          href={`/admin/citas?open=${item.id}`}
          aria-label={`Abrir seguimiento de ${item.name}`}
          className="flex min-h-[3.25rem] items-center justify-between gap-3 rounded-xl border border-ink-line bg-cream-soft p-3 transition-colors hover:border-champagne-soft focus-visible:outline-none focus-visible:shadow-focus-ring"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{item.name}</p>
            <p className="text-xs text-amber-700">Venció: {formatShortDate(item.followUpAt)}</p>
          </div>
          <span className="shrink-0 text-[0.7rem] text-ink-subtle">
            {commercialStatusLabels[item.commercialStatus ?? 'pending']}
          </span>
        </Link>
      ))}
    </div>
  )
}
