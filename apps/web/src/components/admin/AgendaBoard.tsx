'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { parseISO } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { es } from 'date-fns/locale'
import { AlertTriangle, CalendarCheck, CheckCircle, MessageCircle, Phone, XCircle } from 'lucide-react'
import { LayoutGroup, motion } from '@/components/motion'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { BUSINESS_TZ, cn, formatTime12 } from '@/lib/utils'
import { formatWhatsAppUrl, isVideoEngagement } from '@/lib/commercial'
import { durationLabel, relativeLabel } from '@/lib/agenda'
import { useDeferredAction } from './useDeferredAction'
import type { AppointmentType } from '@/types'

export interface AgendaAppointment {
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
  productType: string
  budgetRange: string
}

const dayKeyOf = (iso: string) => formatInTimeZone(parseISO(iso), BUSINESS_TZ, 'yyyy-MM-dd')
const keyLabel = (key: string, pattern: string) =>
  formatInTimeZone(parseISO(`${key}T12:00:00Z`), 'UTC', pattern, { locale: es }).replace(/\./g, '')

function Check2({ ok, okLabel, pendingLabel }: { ok: boolean; okLabel: string; pendingLabel: string }) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full border px-2 py-0.5 text-[0.7rem] font-medium',
      ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800',
    )}>
      {ok ? okLabel : pendingLabel}
    </span>
  )
}

function Readiness({ appt }: { appt: AgendaAppointment }) {
  if (appt.status === 'pending') {
    return (
      <span className="inline-flex items-center rounded-full border border-champagne-soft bg-champagne-tint px-2 py-0.5 text-[0.7rem] font-medium text-champagne-deep">
        Por decidir
      </span>
    )
  }
  return (
    <>
      <Check2 ok={appt.clientConfirmed} okLabel="Confirmó" pendingLabel="Sin confirmar" />
      {!isVideoEngagement(appt.appointmentType) && (
        <Check2 ok={appt.hasIdentification} okLabel="ID" pendingLabel="Sin ID" />
      )}
      {appt.guestCount > 0 && (
        <Check2 ok={appt.guestsAllVerified} okLabel={`+${appt.guestCount} verificados`} pendingLabel={`+${appt.guestCount} sin verificar`} />
      )}
      {isVideoEngagement(appt.appointmentType) && (
        <Check2 ok={appt.hasMeetingUrl} okLabel="Link listo" pendingLabel="Sin link" />
      )}
    </>
  )
}

/**
 * Agenda del panel: tira de la semana (cuántas citas tiene cada día) y el
 * día elegido como línea de tiempo, con los huecos libres entre citas, la
 * marca de «ahora» y la siguiente cita destacada. La asistencia se marca con
 * «Deshacer» (no se guarda hasta que vence la ventana).
 *
 * `serverNowMs` hace que servidor y navegador pinten lo mismo al hidratar;
 * después el reloj se actualiza cada minuto.
 */
export function AgendaBoard({
  appointments,
  dayKeys,
  todayKey,
  serverNowMs,
  error = false,
}: {
  appointments: AgendaAppointment[]
  dayKeys: string[]
  todayKey: string
  serverNowMs: number
  error?: boolean
}) {
  const router = useRouter()
  const schedule = useDeferredAction()
  const [items, setItems] = useState(appointments)
  const [selected, setSelected] = useState(todayKey)
  const [nowMs, setNowMs] = useState(serverNowMs)

  useEffect(() => { setItems(appointments) }, [appointments])
  useEffect(() => {
    setNowMs(Date.now())
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const byDay = useMemo(() => {
    const map = new Map<string, AgendaAppointment[]>()
    for (const key of dayKeys) map.set(key, [])
    for (const a of items) map.get(dayKeyOf(a.slotDatetime))?.push(a)
    for (const list of map.values()) list.sort((a, b) => a.slotDatetime.localeCompare(b.slotDatetime))
    return map
  }, [items, dayKeys])

  const dayItems = byDay.get(selected) ?? []
  const isToday = selected === todayKey
  const nextUp = isToday
    ? dayItems.find(a => a.status === 'accepted' && new Date(a.slotDatetime).getTime() + 30 * 60_000 > nowMs)
    : undefined

  const markAttendance = useCallback((appt: AgendaAppointment, attended: boolean) => {
    const previous = appt.attended
    setItems(prev => prev.map(a => (a.id === appt.id ? { ...a, attended } : a)))
    schedule(`attend:${appt.id}`, {
      message: attended ? `${appt.name.split(' ')[0]}: asistió` : `${appt.name.split(' ')[0]}: no asistió`,
      onUndo: () => setItems(prev => prev.map(a => (a.id === appt.id ? { ...a, attended: previous } : a))),
      run: async () => {
        try {
          const res = await fetch(`/api/admin/appointments/${appt.id}/attend`, {
            method: 'POST',
            keepalive: true,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ attended }),
          })
          if (!res.ok) {
            const err = await res.json().catch(() => ({})) as { error?: string }
            throw new Error(err.error ?? 'No se pudo registrar la asistencia')
          }
        } catch (err) {
          setItems(prev => prev.map(a => (a.id === appt.id ? { ...a, attended: previous } : a)))
          toast.error(err instanceof Error ? err.message : 'No se pudo registrar la asistencia')
        }
      },
    })
  }, [schedule])

  if (error) {
    return (
      <div className="rounded-2xl border border-admin-line bg-admin-panel">
        <EmptyState
          icon={<AlertTriangle size={36} strokeWidth={1} />}
          title="No pudimos cargar la agenda"
          description="Hubo un problema al traer las citas. Vuelve a intentarlo en un momento."
          action={{ label: 'Reintentar', onClick: () => router.refresh() }}
        />
      </div>
    )
  }

  // Línea de tiempo: citas en orden, con «Libre» entre huecos de 1 h o más
  // y la marca de «ahora» donde cae (solo hoy).
  const rows: Array<{ kind: 'appt'; appt: AgendaAppointment } | { kind: 'gap'; minutes: number } | { kind: 'now' }> = []
  let nowPlaced = !isToday
  dayItems.forEach((appt, i) => {
    const start = new Date(appt.slotDatetime).getTime()
    if (i > 0) {
      const prevEnd = new Date(dayItems[i - 1].slotDatetime).getTime() + 60 * 60_000
      const gap = (start - prevEnd) / 60_000
      if (gap >= 60) rows.push({ kind: 'gap', minutes: gap })
    }
    if (!nowPlaced && start > nowMs) { rows.push({ kind: 'now' }); nowPlaced = true }
    rows.push({ kind: 'appt', appt })
  })
  if (!nowPlaced && dayItems.length > 0) rows.push({ kind: 'now' })

  const confirmed = dayItems.filter(a => a.status === 'accepted').length
  const pending = dayItems.length - confirmed

  return (
    <div className="space-y-5">
      {/* Tira de la semana */}
      <LayoutGroup id="agenda-semana">
      <div role="group" aria-label="Días de la semana" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {dayKeys.map(key => {
          const list = byDay.get(key) ?? []
          const acc = list.filter(a => a.status === 'accepted').length
          const pen = list.length - acc
          const active = key === selected
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(key)}
              aria-pressed={active}
              aria-label={`${keyLabel(key, "EEEE d 'de' MMMM")}: ${acc} confirmadas${pen ? `, ${pen} por decidir` : ''}`}
              className={cn(
                'relative flex min-h-[64px] min-w-[64px] flex-1 flex-col items-center justify-center rounded-xl border px-2 py-2 transition-colors focus-visible:shadow-focus-ring',
                active ? 'border-transparent text-porcelain' : 'border-admin-line bg-admin-panel text-ink hover:border-champagne-soft',
              )}
            >
              {active && (
                <motion.span
                  layoutId="agenda-dia"
                  className="absolute inset-0 rounded-xl bg-showroom-ink"
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                />
              )}
              <span className={cn('relative text-[0.7rem] uppercase tracking-eyebrow', active ? 'text-porcelain/75' : 'text-ink-muted')}>
                {key === todayKey ? 'Hoy' : keyLabel(key, 'EEE')}
              </span>
              <span className="relative font-serif text-xl leading-tight">{keyLabel(key, 'd')}</span>
              <span className="relative mt-0.5 flex h-2 items-center gap-1" aria-hidden>
                {Array.from({ length: Math.min(acc, 4) }).map((_, i) => (
                  <span key={`a${i}`} className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-champagne-soft' : 'bg-champagne-solid')} />
                ))}
                {pen > 0 && <span className={cn('h-1.5 w-1.5 rounded-full border', active ? 'border-champagne-soft' : 'border-champagne-solid')} />}
              </span>
            </button>
          )
        })}
      </div>
      </LayoutGroup>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-2xl font-light text-ink">
          {isToday ? 'Hoy' : keyLabel(selected, "EEEE d 'de' MMMM").replace(/^./, c => c.toUpperCase())}
        </h2>
        <p className="text-sm text-ink-muted">
          {dayItems.length === 0 ? 'Sin citas' : `${confirmed} confirmada${confirmed === 1 ? '' : 's'}${pending ? ` · ${pending} por decidir` : ''}`}
        </p>
      </div>

      {nextUp && (
        <div className="rounded-2xl bg-showroom-ink px-5 py-4 text-porcelain">
          <p className="text-xs uppercase tracking-eyebrow text-champagne-soft">Siguiente · {relativeLabel(new Date(nextUp.slotDatetime).getTime(), nowMs)}</p>
          <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="font-serif text-[1.7rem] font-light leading-tight">
              {formatTime12(nextUp.slotDatetime)} · {nextUp.name}
            </p>
            <Link href={`/admin/citas?open=${nextUp.id}`} className="inline-flex min-h-[44px] items-center text-sm text-champagne-soft underline underline-offset-4 hover:text-porcelain">
              Abrir ficha
            </Link>
          </div>
          {(nextUp.productType || nextUp.budgetRange) && (
            <p className="text-sm text-porcelain/80">Quiere ver: {[nextUp.productType, nextUp.budgetRange].filter(Boolean).join(' · ')}</p>
          )}
        </div>
      )}

      {dayItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-admin-line">
          <EmptyState
            icon={<CalendarCheck size={34} strokeWidth={1} />}
            title={isToday ? 'Día libre' : 'Sin citas este día'}
            description="Las citas confirmadas y por decidir aparecen aquí."
          />
        </div>
      ) : (
        <ol className="relative space-y-2" aria-label="Línea de tiempo del día">
          {rows.map((row, i) => (
            <Fragment key={row.kind === 'appt' ? row.appt.id : `${row.kind}-${i}`}>
              {row.kind === 'now' && (
                <li aria-label="Ahora" className="flex items-center gap-3 py-1 text-[0.7rem] font-semibold uppercase tracking-eyebrow text-red-700">
                  <span className="w-[4.5rem] text-right">Ahora</span>
                  <span className="h-px flex-1 bg-red-300" />
                </li>
              )}
              {row.kind === 'gap' && (
                <li className="flex items-center gap-3 py-0.5 text-xs text-ink-muted">
                  <span className="w-[4.5rem]" />
                  <span className="border-l border-dashed border-admin-line pl-3">Libre · {durationLabel(row.minutes)}</span>
                </li>
              )}
              {row.kind === 'appt' && (() => {
                const appt = row.appt
                const start = new Date(appt.slotDatetime).getTime()
                const past = start + 60 * 60_000 < nowMs
                const isNext = nextUp?.id === appt.id
                const [num, period] = formatTime12(appt.slotDatetime).split(' ')
                return (
                  <li className="grid grid-cols-[4.5rem_1fr] gap-3">
                    <p className={cn('pt-3 text-right leading-none', past ? 'text-ink-muted' : 'text-ink')}>
                      <span className="font-serif text-[1.35rem] tabular-nums">{num}</span>
                      <span className="ml-0.5 text-[0.7rem]">{period}</span>
                    </p>
                    <div className={cn(
                      'rounded-2xl border bg-admin-panel p-3.5 sm:p-4',
                      isNext ? 'border-champagne-solid' : appt.status === 'pending' ? 'border-dashed border-champagne-soft' : 'border-admin-line',
                      past && 'opacity-80',
                    )}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link href={`/admin/citas?open=${appt.id}`} className="block truncate font-medium text-ink hover:text-champagne-deep focus-visible:shadow-focus-ring">
                            {appt.name}
                          </Link>
                          <p className="text-xs text-ink-muted">
                            {isVideoEngagement(appt.appointmentType) ? 'Videollamada' : 'Showroom'}
                            {appt.productType ? ` · ${appt.productType}` : ''}
                            {appt.budgetRange ? ` · ${appt.budgetRange}` : ''}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1"><Readiness appt={appt} /></div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {appt.status === 'accepted' && selected <= todayKey && (
                          <>
                            <Button
                              size="sm"
                              variant={appt.attended === true ? 'gold' : 'outline'}
                              className="min-h-[44px] px-3 text-sm"
                              aria-pressed={appt.attended === true}
                              onClick={() => markAttendance(appt, true)}
                            >
                              <CheckCircle size={15} strokeWidth={1.5} /> Asistió
                            </Button>
                            <Button
                              size="sm"
                              variant={appt.attended === false ? 'danger' : 'ghost'}
                              className="min-h-[44px] px-3 text-sm"
                              aria-pressed={appt.attended === false}
                              onClick={() => markAttendance(appt, false)}
                            >
                              <XCircle size={15} strokeWidth={1.5} /> No asistió
                            </Button>
                          </>
                        )}
                        {appt.phone && (
                          <span className="ml-auto flex gap-1">
                            <a href={`tel:${appt.phone}`} aria-label={`Llamar a ${appt.name}`} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-admin-line text-ink-muted hover:text-ink focus-visible:shadow-focus-ring">
                              <Phone size={16} strokeWidth={1.5} />
                            </a>
                            <a href={formatWhatsAppUrl(appt.phone, appt.name)} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp a ${appt.name}`} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-200 text-emerald-800 hover:bg-emerald-50 focus-visible:shadow-focus-ring">
                              <MessageCircle size={16} strokeWidth={1.5} />
                            </a>
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })()}
            </Fragment>
          ))}
        </ol>
      )}
    </div>
  )
}
