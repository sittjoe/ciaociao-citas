import { MessageCircle, Users } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import type { GuestStatus } from '@/types'

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://citas.ciaociao.mx'

export interface GuestSummary {
  id:          string
  name:        string
  status:      GuestStatus
  verifyToken: string | null
}

interface GuestsPanelProps {
  guests:   GuestSummary[]
  hostName: string
  dateStr:  string
  timeStr:  string
}

const statusMap: Record<Exclude<GuestStatus, 'excluded'>, { label: string; className: string }> = {
  verified: { label: 'Verificado',           className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  pending:  { label: 'Falta identificación', className: 'bg-amber-50 text-amber-700 border border-amber-200' },
  expired:  { label: 'Plazo vencido',        className: 'bg-stone-100 text-stone-500 border border-stone-200' },
}

function whatsappShareUrl(guest: GuestSummary, hostName: string, dateStr: string, timeStr: string): string {
  const link    = `${SITE}/invitado/${guest.verifyToken}`
  const message = `Hola ${guest.name}, soy ${hostName}. Te comparto tu enlace personal para verificar tu identidad antes de nuestra visita a Ciao Ciao Joyería el ${dateStr} a las ${timeStr} h: ${link}`
  return `https://wa.me/?text=${encodeURIComponent(message)}`
}

export default function GuestsPanel({ guests, hostName, dateStr, timeStr }: GuestsPanelProps) {
  const visible = guests.filter(g => g.status !== 'excluded')
  if (visible.length === 0) return null

  const pendingCount = visible.filter(g => g.status === 'pending').length

  return (
    <div className="rounded-2xl border border-ink-line bg-porcelain/70 px-4 py-4">
      <div className="mb-1.5 flex items-center gap-2">
        <Users size={14} strokeWidth={1.5} className="text-champagne" />
        <p className="h-eyebrow">Tus invitados</p>
      </div>
      <p className="text-xs leading-relaxed text-ink-muted">
        {pendingCount > 0
          ? 'Cada invitado debe verificar su identidad con su enlace personal antes de la visita. El plazo vence 24 horas antes de la cita; sin verificación no podrán ingresar al showroom.'
          : 'Todos tus invitados completaron su verificación. Los esperamos en el showroom.'}
      </p>

      <ul className="mt-3 divide-y divide-ink-line">
        {visible.map(guest => {
          const status = statusMap[guest.status as Exclude<GuestStatus, 'excluded'>]
            ?? { label: guest.status, className: '' }
          const canResend = guest.status === 'pending' && Boolean(guest.verifyToken)
          return (
            <li key={guest.id} className="flex flex-col gap-2.5 py-3 first:pt-1 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center justify-between gap-3 sm:justify-start">
                <span className="truncate text-sm text-ink">{guest.name}</span>
                <Badge className={cn('shrink-0', status.className)}>{status.label}</Badge>
              </div>
              {canResend && (
                <a
                  href={whatsappShareUrl(guest, hostName, dateStr, timeStr)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-champagne px-4 py-2 text-xs font-medium text-champagne transition-colors duration-200 hover:bg-champagne-soft sm:min-h-[40px]"
                >
                  <MessageCircle size={14} strokeWidth={1.5} />
                  Reenviar su link
                </a>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
