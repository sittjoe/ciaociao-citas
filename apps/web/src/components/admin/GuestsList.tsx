'use client'

import { useEffect, useState, useCallback } from 'react'
import { ShieldCheck, UserX, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from '@/components/motion'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import type { GuestStatus } from '@/types'

interface GuestRow {
  id:                string
  name:              string
  email:             string
  status:            GuestStatus
  identificationUrl: string | null
}

interface GuestsListProps {
  appointmentId: string
}

const STATUS_STYLES: Record<GuestStatus, string> = {
  pending:  'bg-amber-50 text-amber-700 border border-amber-200',
  verified: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  expired:  'bg-red-50 text-red-600 border border-red-200',
  excluded: 'bg-champagne-tint text-ink-muted border border-ink-line',
}

const STATUS_LABELS: Record<GuestStatus, string> = {
  pending:  'Pendiente',
  verified: 'Verificado',
  expired:  'Expirado',
  excluded: 'Excluido',
}

const DOT_COLORS: Record<GuestStatus, string> = {
  pending:  'bg-amber-400',
  verified: 'bg-emerald-500',
  expired:  'bg-red-400',
  excluded: 'bg-ink-subtle',
}

function StatusDot({ status }: { status: GuestStatus }) {
  return (
    <span className="relative inline-flex shrink-0 mt-0.5">
      <span className={cn('w-2 h-2 rounded-full', DOT_COLORS[status])} />
      {status === 'pending' && (
        <span className={cn('absolute inset-0 rounded-full animate-ping opacity-60', DOT_COLORS[status])} />
      )}
    </span>
  )
}

export function GuestsList({ appointmentId }: GuestsListProps) {
  const [guests,  setGuests]  = useState<GuestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [acting,  setActing]  = useState<string | null>(null)

  const fetchGuests = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/appointments/${appointmentId}/guests`)
      if (!res.ok) throw new Error()
      const data = await res.json() as { guests: GuestRow[] }
      setGuests(data.guests)
    } catch {
      toast.error('Error al cargar invitados')
    } finally {
      setLoading(false)
    }
  }, [appointmentId])

  useEffect(() => { fetchGuests() }, [fetchGuests])

  const act = useCallback(async (guestId: string, action: 'verify' | 'exclude') => {
    setActing(guestId)
    try {
      const res = await fetch(
        `/api/admin/appointments/${appointmentId}/guests/${guestId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        },
      )
      if (!res.ok) throw new Error()
      await fetchGuests()
      toast.success(action === 'verify' ? 'Invitado verificado' : 'Invitado excluido')
    } catch {
      toast.error('Error al actualizar invitado')
    } finally {
      setActing(null)
    }
  }, [appointmentId, fetchGuests])

  if (loading) {
    return (
      <div className="space-y-2 py-1">
        {[1, 2].map(i => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="w-2 h-2" rounded />
            <Skeleton className="h-3 flex-1" />
          </div>
        ))}
      </div>
    )
  }

  if (guests.length === 0) {
    return <p className="text-xs text-ink-muted py-2 italic">Sin invitados en esta cita.</p>
  }

  return (
    <div className="space-y-0">
      <AnimatePresence initial={false}>
        {guests.map(g => (
          <motion.div
            key={g.id}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex items-start justify-between gap-3 py-2 border-b border-ink-line last:border-0"
          >
            <div className="flex items-start gap-2 min-w-0">
              <StatusDot status={g.status} />
              <div className="min-w-0">
                <p className="text-sm text-ink font-medium truncate">{g.name}</p>
                <p className="text-xs text-ink-muted truncate">{g.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge className={cn('text-xs', STATUS_STYLES[g.status])}>
                {STATUS_LABELS[g.status]}
              </Badge>

              {g.identificationUrl && (
                <a
                  href={`/api/admin/id-url?path=${encodeURIComponent(g.identificationUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink-muted hover:text-champagne transition-colors"
                  title="Ver identificación"
                  aria-label="Ver identificación"
                >
                  <ExternalLink size={13} strokeWidth={1.5} />
                </a>
              )}
              {!g.identificationUrl && (
                <span className="text-[10px] text-ink-subtle whitespace-nowrap">Sin ID</span>
              )}

              {(g.status === 'pending' || g.status === 'expired') && (
                <button
                  onClick={() => act(g.id, 'verify')}
                  disabled={acting === g.id}
                  className="text-emerald-600 hover:text-emerald-700 transition-colors disabled:opacity-40"
                  title="Verificar manualmente"
                  aria-label={`Verificar manualmente a ${g.name}`}
                >
                  <ShieldCheck size={14} strokeWidth={1.5} />
                </button>
              )}

              {g.status !== 'excluded' && g.status !== 'verified' && (
                <button
                  onClick={() => act(g.id, 'exclude')}
                  disabled={acting === g.id}
                  className="text-red-400 hover:text-red-500 transition-colors disabled:opacity-40"
                  title="Excluir invitado"
                  aria-label={`Excluir a ${g.name}`}
                >
                  <UserX size={14} strokeWidth={1.5} />
                </button>
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
