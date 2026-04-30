import { cn } from '@/lib/utils'
import type { AppointmentStatus } from '@/types'

const statusMap: Record<AppointmentStatus, { label: string; className: string }> = {
  pending:   { label: 'Pendiente',  className: 'status-pending'   },
  accepted:  { label: 'Confirmada', className: 'status-accepted'  },
  rejected:  { label: 'Rechazada',  className: 'status-rejected'  },
  cancelled: { label: 'Cancelada',  className: 'status-cancelled' },
}

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const { label, className } = statusMap[status] ?? { label: status, className: '' }
  return (
    <span className={cn('inline-block px-2.5 py-0.5 rounded-full text-xs font-medium', className)}>
      {label}
    </span>
  )
}

export function Badge({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span className={cn('inline-block px-2.5 py-0.5 rounded-full text-xs font-medium', className)}>
      {children}
    </span>
  )
}
