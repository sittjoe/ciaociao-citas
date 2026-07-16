'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { CalendarCheck, CheckCircle, XCircle, Phone, MessageCircle } from 'lucide-react'
import { formatInTimeZone } from 'date-fns-tz'
import { parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn, BUSINESS_TZ } from '@/lib/utils'
import { appointmentTypeLabels, formatWhatsAppUrl, isVideoEngagement } from '@/lib/commercial'
import type { AppointmentType } from '@/types'

export interface TodayAppointment {
  id: string
  name: string
  phone: string
  slotDatetime: string
  appointmentType: AppointmentType
  status: 'pending' | 'accepted'
  clientConfirmed: boolean
  hasIdentification: boolean
  guestCount: number
  guestsAllVerified: boolean
  hasMeetingUrl: boolean
  attended: boolean | null
}

function formatHour(iso: string): string {
  return formatInTimeZone(parseISO(iso), BUSINESS_TZ, 'h:mm a', { locale: es })
}

function Semaphore({ ok, okLabel, pendingLabel }: { ok: boolean; okLabel: string; pendingLabel: string }) {
  return (
    <Badge
      className={ok
        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
        : 'bg-amber-50 text-amber-700 border border-amber-200'}
    >
      {ok ? okLabel : pendingLabel}
    </Badge>
  )
}

function Semaphores({ appt }: { appt: TodayAppointment }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Semaphore ok={appt.clientConfirmed} okLabel="Cliente confirmó" pendingLabel="Sin confirmar" />
      <Semaphore ok={appt.hasIdentification} okLabel="ID recibida" pendingLabel="ID pendiente" />
      {appt.guestCount > 0 && (
        <Semaphore ok={appt.guestsAllVerified} okLabel="Invitados verificados" pendingLabel="Invitados pendientes" />
      )}
      {isVideoEngagement(appt.appointmentType) && (
        <Semaphore ok={appt.hasMeetingUrl} okLabel="Link de video listo" pendingLabel="Sin link de video" />
      )}
    </div>
  )
}

function ContactActions({ appt }: { appt: TodayAppointment }) {
  if (!appt.phone) return null
  const anchorClasses = cn(
    'inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium',
    'transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:shadow-focus-ring',
  )
  return (
    <div className="flex gap-2">
      <a
        href={`tel:${appt.phone}`}
        className={cn(anchorClasses, 'border border-admin-line text-ink-muted hover:bg-admin-surface hover:text-ink')}
        aria-label={`Llamar a ${appt.name}`}
      >
        <Phone size={16} strokeWidth={1.5} /> Llamar
      </a>
      <a
        href={formatWhatsAppUrl(appt.phone, appt.name)}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(anchorClasses, 'border border-emerald-200 text-emerald-700 hover:bg-emerald-50')}
        aria-label={`Escribir por WhatsApp a ${appt.name}`}
      >
        <MessageCircle size={16} strokeWidth={1.5} /> WhatsApp
      </a>
    </div>
  )
}

function CardHeading({ appt }: { appt: TodayAppointment }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-serif text-xl font-light tabular-nums text-ink leading-none">
          {formatHour(appt.slotDatetime)}
        </p>
        <Link
          href={`/admin/citas?open=${appt.id}`}
          className="mt-1.5 block truncate text-sm font-medium text-ink hover:text-champagne-deep transition-colors focus-visible:outline-none focus-visible:shadow-focus-ring rounded-lg"
        >
          {appt.name}
        </Link>
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <span className="whitespace-nowrap rounded-full border border-admin-line bg-admin-surface px-2 py-0.5 text-[10px] font-semibold text-ink-muted">
          {appointmentTypeLabels[appt.appointmentType]}
        </span>
        {appt.attended === true && (
          <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200">Asistió</Badge>
        )}
        {appt.attended === false && (
          <Badge className="bg-red-50 text-red-600 border border-red-200">No asistió</Badge>
        )}
      </div>
    </div>
  )
}

export function TodayList({ accepted, pending }: { accepted: TodayAppointment[]; pending: TodayAppointment[] }) {
  const [items, setItems] = useState(accepted)
  const [acting, setActing] = useState<string | null>(null)

  useEffect(() => { setItems(accepted) }, [accepted])

  const markAttendance = useCallback(async (id: string, attended: boolean) => {
    setActing(`${id}:${attended}`)
    let previous: boolean | null = null
    setItems(prev => prev.map(a => {
      if (a.id !== id) return a
      previous = a.attended
      return { ...a, attended }
    }))
    try {
      const res = await fetch(`/api/admin/appointments/${id}/attend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attended }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? 'Error')
      }
      toast.success(attended ? 'Marcada como asistió' : 'Marcada como no asistió')
    } catch (err) {
      setItems(prev => prev.map(a => a.id === id ? { ...a, attended: previous } : a))
      toast.error(err instanceof Error ? err.message : 'Error al registrar asistencia')
    } finally {
      setActing(null)
    }
  }, [])

  if (items.length === 0 && pending.length === 0) {
    return (
      <Card variant="admin">
        <EmptyState
          icon={<CalendarCheck size={40} strokeWidth={1} />}
          title="Sin citas para hoy"
          description="El día está libre. Las nuevas solicitudes aparecerán aquí en cuanto lleguen."
        />
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <p className="h-eyebrow">Confirmadas</p>
        {items.length === 0 ? (
          <Card variant="admin" className="p-4">
            <p className="text-sm text-ink-muted">Sin citas confirmadas para hoy.</p>
          </Card>
        ) : items.map(appt => (
          <Card key={appt.id} variant="admin" className="p-4 space-y-3">
            <CardHeading appt={appt} />
            <Semaphores appt={appt} />
            <div className="flex gap-2 pt-1">
              <Button
                variant={appt.attended === true ? 'gold' : 'outline'}
                size="lg"
                className="flex-1 min-h-[44px]"
                loading={acting === `${appt.id}:true`}
                disabled={acting !== null && acting !== `${appt.id}:true`}
                onClick={() => void markAttendance(appt.id, true)}
              >
                <CheckCircle size={16} strokeWidth={1.5} /> Asistió
              </Button>
              <Button
                variant={appt.attended === false ? 'danger' : 'ghost'}
                size="lg"
                className="flex-1 min-h-[44px]"
                loading={acting === `${appt.id}:false`}
                disabled={acting !== null && acting !== `${appt.id}:false`}
                onClick={() => void markAttendance(appt.id, false)}
              >
                <XCircle size={16} strokeWidth={1.5} /> No asistió
              </Button>
            </div>
            <ContactActions appt={appt} />
          </Card>
        ))}
      </section>

      {pending.length > 0 && (
        <section className="space-y-3">
          <p className="h-eyebrow">Pendientes de decidir hoy</p>
          {pending.map(appt => (
            <Card key={appt.id} variant="admin" className="p-4 space-y-3">
              <CardHeading appt={appt} />
              <Semaphores appt={appt} />
              <Link
                href={`/admin/citas?open=${appt.id}`}
                className={cn(
                  'inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold',
                  'bg-champagne-tint text-champagne-deep hover:bg-champagne-soft transition-all duration-200',
                  'active:scale-[0.98] focus-visible:outline-none focus-visible:shadow-focus-ring',
                )}
              >
                Decidir en Citas
              </Link>
              <ContactActions appt={appt} />
            </Card>
          ))}
        </section>
      )}
    </div>
  )
}
