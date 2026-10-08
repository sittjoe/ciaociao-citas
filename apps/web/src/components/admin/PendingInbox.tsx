'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { parseISO } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { es } from 'date-fns/locale'
import { BellRing, Check, IdCard, Inbox, Link2, X } from 'lucide-react'
import { AnimatePresence, motion } from '@/components/motion'
import { AlertDialog } from '@/components/ui/AlertDialog'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { BUSINESS_TZ, cn, formatTime12 } from '@/lib/utils'
import { durationLabel, sortInbox, waitLevel, type WaitLevel } from '@/lib/agenda'
import { useDeferredAction } from './useDeferredAction'
import type { SerialAppointment } from './AppointmentDetail'

type Item = SerialAppointment

const priorityLabel = { high: 'Prioridad alta', medium: 'Prioridad media', normal: '' } as const

const waitTone: Record<WaitLevel, string> = {
  fresh:   'text-ink-muted',
  alerted: 'text-champagne-deep',
  overdue: 'text-red-700',
}

function slotLabel(iso: string) {
  const day = formatInTimeZone(parseISO(iso), BUSINESS_TZ, "EEE d MMM", { locale: es }).replace(/\./g, '')
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${formatTime12(iso)}`
}

type Confirming = { item: Item; action: 'accept' | 'reject' } | null

/**
 * Bandeja de solicitudes por decidir. Ordena por urgencia (lo que ocurre
 * pronto, luego prioridad comercial, luego la espera), muestra cuánto lleva
 * esperando cada clienta y si ya saltó el aviso de los 20 minutos, y permite
 * aceptar o rechazar sin abrir la ficha: con confirmación y con «Deshacer»
 * durante unos segundos (la decisión, y por lo tanto el correo a la
 * clienta, no sale hasta que vence esa ventana).
 */
export function PendingInbox({ serverNowMs }: { serverNowMs: number }) {
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState(false)
  const [nowMs, setNowMs] = useState(serverNowMs)
  const [confirming, setConfirming] = useState<Confirming>(null)
  const [links, setLinks] = useState<Record<string, string>>({})
  const schedule = useDeferredAction()

  useEffect(() => {
    setNowMs(Date.now())
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const load = useCallback(async () => {
    setError(false)
    try {
      const res = await fetch('/api/admin/appointments?status=pending&limit=50')
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json() as { appointments?: Item[] }
      setItems(data.appointments ?? [])
    } catch {
      setError(true)
      setItems([])
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const sorted = useMemo(() => sortInbox(items ?? [], nowMs), [items, nowMs])

  const decide = useCallback((item: Item, action: 'accept' | 'reject') => {
    const meetingUrl = (links[item.id] ?? '').trim()
    const first = item.name.split(' ')[0]
    setItems(prev => prev?.filter(a => a.id !== item.id) ?? prev)
    schedule(`decision:${item.id}`, {
      message: action === 'accept' ? `Aceptando la cita de ${first}…` : `Rechazando la solicitud de ${first}…`,
      onUndo: () => setItems(prev => (prev && !prev.some(a => a.id === item.id) ? [...prev, item] : prev)),
      run: async () => {
        try {
          const res = await fetch(`/api/admin/appointments/${item.id}/decision`, {
            method: 'POST',
            keepalive: true,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, ...(meetingUrl ? { meetingUrl } : {}) }),
          })
          if (!res.ok) {
            const err = await res.json().catch(() => ({})) as { error?: string }
            throw new Error(err.error ?? 'No se pudo guardar la decisión')
          }
          toast.success(action === 'accept' ? `Cita de ${first} confirmada. Ya le llegó su correo.` : `Solicitud de ${first} rechazada.`)
        } catch (err) {
          setItems(prev => (prev && !prev.some(a => a.id === item.id) ? [...prev, item] : prev))
          toast.error(err instanceof Error ? err.message : 'No se pudo guardar la decisión')
        }
      },
    })
  }, [links, schedule])

  const alertedCount = sorted.filter(i => waitLevel(new Date(i.createdAt).getTime(), nowMs) !== 'fresh').length

  return (
    <section aria-labelledby="bandeja" className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="bandeja" className="font-serif text-2xl font-light text-ink">
          Por decidir
          {items && items.length > 0 && <span className="ml-2 font-sans text-sm text-ink-muted tabular-nums">{items.length}</span>}
        </h2>
        {alertedCount > 0 && (
          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-champagne-deep">
            <BellRing size={13} strokeWidth={1.5} />
            {alertedCount} {alertedCount === 1 ? 'lleva' : 'llevan'} más de 20 min
          </p>
        )}
      </div>

      {items === null ? (
        <div className="space-y-2" aria-busy="true">
          <span className="sr-only">Cargando solicitudes</span>
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-[132px] w-full rounded-2xl" />)}
        </div>
      ) : error ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-admin-line bg-admin-panel px-4 py-4 text-sm">
          <span className="text-ink-muted">No pudimos cargar las solicitudes.</span>
          <Button size="sm" variant="outline" className="min-h-[44px]" onClick={() => void load()}>Reintentar</Button>
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-admin-line px-4 py-5 text-sm text-ink-muted">
          <Inbox size={18} strokeWidth={1.5} className="text-champagne" />
          Nada por decidir. Las solicitudes nuevas aparecen aquí.
        </div>
      ) : (
        <ul className="space-y-2.5">
          <AnimatePresence initial={false}>
            {sorted.map(item => {
              const created = new Date(item.createdAt).getTime()
              const level = waitLevel(created, nowMs)
              const isVideo = item.appointmentType === 'video_engagement_rings'
              const missingId = !isVideo && !item.identificationUrl
              const wants = [item.productType, item.budgetRange].filter(Boolean).join(' · ')
              return (
                <motion.li
                  key={item.id}
                  layout="position"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 24 }}
                  transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                  className={cn(
                    'rounded-2xl border bg-admin-panel p-4',
                    level === 'overdue' ? 'border-red-200' : level === 'alerted' ? 'border-champagne-soft' : 'border-admin-line',
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                    <div className="min-w-0">
                      <Link
                        href={`/admin/citas?open=${item.id}`}
                        className="block truncate text-[0.95rem] font-medium text-ink hover:text-champagne-deep focus-visible:shadow-focus-ring"
                      >
                        {item.name}
                      </Link>
                      <p className="mt-0.5 text-sm text-ink-muted">
                        {slotLabel(item.slotDatetime)} · {isVideo ? 'Videollamada' : 'Showroom'}
                      </p>
                    </div>
                    <p className={cn('text-xs font-medium tabular-nums', waitTone[level])}>
                      Esperando {durationLabel((nowMs - created) / 60_000)}
                      {item.pendingAlertSentAt && <span className="block text-right font-normal">Aviso enviado al equipo</span>}
                    </p>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
                    {item.commercialPriority && item.commercialPriority !== 'normal' && (
                      <span className={cn('rounded-full border px-2 py-0.5 font-medium',
                        item.commercialPriority === 'high' ? 'border-champagne-solid bg-champagne-tint text-champagne-deep' : 'border-admin-line text-ink-muted')}>
                        {priorityLabel[item.commercialPriority]}
                      </span>
                    )}
                    {!isVideo && (
                      <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5',
                        missingId ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800')}>
                        <IdCard size={11} strokeWidth={1.5} /> {missingId ? 'Sin identificación' : 'Identificación recibida'}
                      </span>
                    )}
                    {(item.guestCount ?? 0) > 0 && (
                      <span className="rounded-full border border-admin-line px-2 py-0.5 text-ink-muted">+{item.guestCount} invitados</span>
                    )}
                    {wants && <span className="text-ink-muted">{wants}</span>}
                  </div>
                  {item.lookingFor && (
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink">«{item.lookingFor}»</p>
                  )}

                  {isVideo && (
                    <label className="mt-3 flex items-center gap-2 rounded-xl border border-admin-line bg-admin-surface px-3">
                      <Link2 size={14} strokeWidth={1.5} className="shrink-0 text-ink-muted" />
                      <span className="sr-only">Link de la videollamada para {item.name}</span>
                      <input
                        type="url"
                        inputMode="url"
                        placeholder="Link de la videollamada (opcional)"
                        value={links[item.id] ?? ''}
                        onChange={e => setLinks(prev => ({ ...prev, [item.id]: e.target.value }))}
                        className="min-h-[44px] w-full border-0 bg-transparent px-0 text-sm shadow-none focus:shadow-none"
                      />
                    </label>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="min-h-[44px] px-4 text-sm"
                      disabled={missingId}
                      title={missingId ? 'Para aceptar un showroom hace falta su identificación' : undefined}
                      onClick={() => setConfirming({ item, action: 'accept' })}
                    >
                      <Check size={15} strokeWidth={1.75} /> Aceptar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="min-h-[44px] px-4 text-sm"
                      onClick={() => setConfirming({ item, action: 'reject' })}
                    >
                      <X size={15} strokeWidth={1.5} /> Rechazar
                    </Button>
                    <Link
                      href={`/admin/citas?open=${item.id}`}
                      className="ml-auto inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm text-champagne-solid hover:text-champagne-deep focus-visible:shadow-focus-ring"
                    >
                      Ver ficha
                    </Link>
                  </div>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      )}

      <AlertDialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        onConfirm={() => {
          if (!confirming) return
          decide(confirming.item, confirming.action)
          setConfirming(null)
        }}
        variant={confirming?.action === 'reject' ? 'danger' : 'warning'}
        title={confirming?.action === 'accept' ? `¿Aceptar la cita de ${confirming.item.name}?` : `¿Rechazar la solicitud de ${confirming?.item.name ?? ''}?`}
        description={confirming?.action === 'accept'
          ? (confirming.item.appointmentType === 'video_engagement_rings' && !(links[confirming.item.id] ?? '').trim()
              ? 'Le enviaremos la confirmación con su invitación de calendario. Aún no hay link: le diremos que llega antes de la llamada. Tendrás unos segundos para deshacer.'
              : 'Le enviaremos la confirmación con su invitación de calendario. Tendrás unos segundos para deshacer.')
          : 'Le avisaremos por correo que no podemos confirmar ese horario y se libera el lugar. Tendrás unos segundos para deshacer.'}
        confirmLabel={confirming?.action === 'accept' ? 'Aceptar' : 'Rechazar'}
        cancelLabel="Volver"
      />
    </section>
  )
}
