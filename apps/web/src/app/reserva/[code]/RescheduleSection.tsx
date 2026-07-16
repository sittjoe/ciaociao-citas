'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { parseISO } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { CalendarClock } from 'lucide-react'
import { BUSINESS_TZ, cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import type { AppointmentType } from '@/types'

interface RescheduleSectionProps {
  token:           string
  appointmentType: AppointmentType
  currentSlotId:   string
}

interface SlotOption {
  id:       string
  datetime: string
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

export default function RescheduleSection({ token, appointmentType, currentSlotId }: RescheduleSectionProps) {
  const router = useRouter()

  const [open,         setOpen]         = useState(false)
  const [loadState,    setLoadState]    = useState<LoadState>('idle')
  const [slots,        setSlots]        = useState<SlotOption[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<SlotOption | null>(null)
  const [saving,       setSaving]       = useState(false)

  const loadSlots = useCallback(async () => {
    setLoadState('loading')
    try {
      const res = await fetch(`/api/slots?appointmentType=${appointmentType}`)
      if (!res.ok) throw new Error('Error')
      const data = await res.json() as { slots?: SlotOption[] }
      const nowMs = Date.now()
      const usable = (data.slots ?? [])
        .filter(s => s.id !== currentSlotId)
        .filter(s => parseISO(s.datetime).getTime() > nowMs)
        .sort((a, b) => parseISO(a.datetime).getTime() - parseISO(b.datetime).getTime())
      setSlots(usable)
      setLoadState('ready')
    } catch {
      setLoadState('error')
    }
  }, [appointmentType, currentSlotId])

  useEffect(() => {
    if (open && loadState === 'idle') void loadSlots()
  }, [open, loadState, loadSlots])

  const days = useMemo(() => {
    const map = new Map<string, SlotOption[]>()
    for (const slot of slots) {
      const key = formatInTimeZone(parseISO(slot.datetime), BUSINESS_TZ, 'yyyy-MM-dd')
      const list = map.get(key)
      if (list) list.push(slot)
      else map.set(key, [slot])
    }
    return Array.from(map.entries()).map(([key, daySlots]) => ({ key, daySlots }))
  }, [slots])

  const activeDate = selectedDate ?? days[0]?.key ?? null
  const activeDaySlots = days.find(d => d.key === activeDate)?.daySlots ?? []

  const confirm = async () => {
    if (!selectedSlot) return
    setSaving(true)
    try {
      const res  = await fetch(`/api/reschedule/${token}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ newSlotId: selectedSlot.id }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error al reagendar la cita')
      toast.success('Tu cita fue reprogramada. Te enviamos la confirmación por correo.')
      setOpen(false)
      setSelectedSlot(null)
      setSelectedDate(null)
      setLoadState('idle')
      router.refresh()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al reagendar la cita')
      // El horario pudo haberse ocupado mientras la clienta decidía:
      // refresca la disponibilidad para no volver a ofrecerlo.
      setSelectedSlot(null)
      void loadSlots()
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-champagne px-5 py-2.5 text-sm font-medium text-champagne transition-colors duration-200 hover:bg-champagne-soft"
      >
        <CalendarClock size={15} strokeWidth={1.5} />
        Cambiar fecha u hora
      </button>
    )
  }

  return (
    <div className="space-y-4 rounded-2xl border border-ink-line bg-porcelain/70 p-4">
      <div>
        <p className="h-eyebrow mb-1.5">Nuevo horario</p>
        <p className="text-xs leading-relaxed text-ink-muted">
          Elige el día y la hora que prefieras. Tu lugar actual se libera al confirmar el cambio.
        </p>
      </div>

      {loadState === 'loading' && <Skeleton variant="text" rows={3} />}

      {loadState === 'error' && (
        <div className="space-y-3 py-2 text-center">
          <p className="text-sm text-ink-muted">No pudimos cargar los horarios disponibles.</p>
          <Button variant="outline" size="sm" onClick={() => void loadSlots()}>
            Intentar de nuevo
          </Button>
        </div>
      )}

      {loadState === 'ready' && days.length === 0 && (
        <p className="py-2 text-center text-sm leading-relaxed text-ink-muted">
          Por el momento no hay otros horarios disponibles. Escríbenos y con gusto buscamos una alternativa para ti.
        </p>
      )}

      {loadState === 'ready' && days.length > 0 && (
        <>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="listbox" aria-label="Días disponibles">
            {days.map(({ key, daySlots }) => {
              const selected = key === activeDate
              const sample = parseISO(daySlots[0].datetime)
              return (
                <button
                  key={key}
                  role="option"
                  aria-selected={selected}
                  onClick={() => { setSelectedDate(key); setSelectedSlot(null) }}
                  className={cn(
                    'flex min-h-[44px] shrink-0 flex-col items-center rounded-xl border px-4 py-2 transition-colors duration-200',
                    selected
                      ? 'border-champagne bg-champagne-solid text-white'
                      : 'border-ink-line bg-white/60 text-ink hover:border-champagne',
                  )}
                >
                  <span className={cn('text-[0.6rem] font-semibold uppercase tracking-wide', selected ? 'text-white/80' : 'text-ink-subtle')}>
                    {formatInTimeZone(sample, BUSINESS_TZ, 'EEE', { locale: es })}
                  </span>
                  <span className="text-sm font-medium">
                    {formatInTimeZone(sample, BUSINESS_TZ, "d MMM", { locale: es })}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {activeDaySlots.map(slot => {
              const selected = selectedSlot?.id === slot.id
              return (
                <button
                  key={slot.id}
                  onClick={() => setSelectedSlot(slot)}
                  className={cn(
                    'min-h-[44px] rounded-xl border py-2.5 text-sm font-medium transition-colors duration-200',
                    selected
                      ? 'border-champagne bg-champagne-solid text-white'
                      : 'border-ink-line text-ink hover:border-champagne hover:bg-champagne-soft',
                  )}
                >
                  {formatInTimeZone(parseISO(slot.datetime), BUSINESS_TZ, 'HH:mm')}
                </button>
              )
            })}
          </div>

          {selectedSlot && (
            <div className="space-y-2.5 border-t border-ink-line pt-3">
              <p className="text-center text-sm text-ink">
                Nueva cita:{' '}
                <span className="font-medium">
                  {formatInTimeZone(parseISO(selectedSlot.datetime), BUSINESS_TZ, "EEEE d 'de' MMMM", { locale: es })}
                  {' · '}
                  {formatInTimeZone(parseISO(selectedSlot.datetime), BUSINESS_TZ, 'HH:mm')} h
                </span>
              </p>
              <Button
                onClick={() => void confirm()}
                loading={saving}
                className="min-h-[44px] w-full"
              >
                Confirmar nuevo horario
              </Button>
            </div>
          )}
        </>
      )}

      <button
        onClick={() => { setOpen(false); setSelectedSlot(null) }}
        disabled={saving}
        className="min-h-[44px] w-full py-1 text-xs text-ink-subtle transition-colors hover:text-ink disabled:opacity-40"
      >
        Conservar mi horario actual
      </button>
    </div>
  )
}
