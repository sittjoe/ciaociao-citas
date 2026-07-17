'use client'

import { useEffect, useMemo, useState } from 'react'
import { parseISO } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { motion, LayoutGroup } from '@/components/motion'
import { BUSINESS_TZ, cn } from '@/lib/utils'
import type { AppointmentType } from '@/types'

/**
 * Zona horaria del dispositivo. Disponible solo tras montar: en SSR no la
 * conocemos y resolverla en el servidor causaría un hydration mismatch.
 */
export function useDeviceTimeZone(): string | null {
  const [tz, setTz] = useState<string | null>(null)
  useEffect(() => {
    try {
      setTz(Intl.DateTimeFormat().resolvedOptions().timeZone ?? null)
    } catch {
      setTz(null)
    }
  }, [])
  return tz
}

/** «4:00 pm» — 12h con Intl, normalizado (es-MX produce «p. m.»). */
function formatTime12(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone })
    .format(date)
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/\s*p\.?\s*m\.?$/i, ' pm')
    .replace(/\s*a\.?\s*m\.?$/i, ' am')
}

/**
 * Hora CDMX y hora local del dispositivo para el mismo instante.
 * `local` es null si no conocemos la zona del dispositivo, si es la misma que
 * CDMX o si el reloj coincide (mostrar dos veces lo mismo sería ruido).
 */
export function dualTimeLabel(iso: string, deviceTz: string | null): { cdmx: string; local: string | null } {
  const date = parseISO(iso)
  const cdmx = formatTime12(date, BUSINESS_TZ)
  if (!deviceTz || deviceTz === BUSINESS_TZ) return { cdmx, local: null }
  try {
    const local = formatTime12(date, deviceTz)
    return { cdmx, local: local === cdmx ? null : local }
  } catch {
    return { cdmx, local: null }
  }
}

interface SlotPickerProps {
  slots:          { id: string; datetime: string }[]
  /** yyyy-MM-dd in BUSINESS_TZ — same key CalendarView emits */
  selectedDate:   string
  selectedSlotId: string | null
  onSelectSlot:   (slotId: string) => void
  /** En video-consulta, si el dispositivo está fuera de CDMX se muestran ambas horas. */
  appointmentType?: AppointmentType
}

export function SlotPicker({ slots, selectedDate, selectedSlotId, onSelectSlot, appointmentType = 'showroom' }: SlotPickerProps) {
  const deviceTz = useDeviceTimeZone()
  const isVideo  = appointmentType === 'video_engagement_rings'

  const daySlots = useMemo(() => {
    const nowMs = Date.now()
    return slots
      .filter(s => formatInTimeZone(parseISO(s.datetime), BUSINESS_TZ, 'yyyy-MM-dd') === selectedDate)
      .filter(s => parseISO(s.datetime).getTime() > nowMs)
      .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
  }, [slots, selectedDate])

  const entries = useMemo(
    () => daySlots.map(slot => ({
      slot,
      dual: isVideo ? dualTimeLabel(slot.datetime, deviceTz) : null,
    })),
    [daySlots, isVideo, deviceTz],
  )
  const showLocalTime = entries.some(entry => entry.dual?.local)

  if (daySlots.length === 0) {
    return (
      <p className="text-center text-ink-muted text-sm py-4">
        No hay horarios disponibles para este día.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <LayoutGroup>
      <div className={cn('grid gap-2', showLocalTime ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-3 sm:grid-cols-4')}>
        {entries.map(({ slot, dual }) => {
          const selected = selectedSlotId === slot.id
          const ariaLabel = isVideo && dual
            ? `${dual.cdmx} en Ciudad de México${dual.local ? `, ${dual.local} en tu zona horaria` : ''}`
            : `${formatInTimeZone(parseISO(slot.datetime), BUSINESS_TZ, 'HH:mm')} horas, hora de Ciudad de México`
          return (
            <button
              key={slot.id}
              type="button"
              onClick={() => onSelectSlot(slot.id)}
              aria-pressed={selected}
              aria-label={ariaLabel}
              className={cn(
                'slot-3d relative min-h-[44px] overflow-hidden rounded-xl border px-2 text-sm font-medium',
                showLocalTime ? 'py-2' : 'py-2.5',
                selected
                  ? 'text-white border-champagne shadow-pop'
                  : 'border-ink-line text-ink hover:border-champagne hover:bg-champagne-tint',
              )}
            >
              {selected && (
                <motion.span
                  layoutId="slot-pill"
                  className="absolute inset-0 bg-champagne-solid"
                  transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                />
              )}
              {showLocalTime && dual ? (
                <span className="relative z-10 flex flex-col items-center gap-0.5 leading-tight">
                  <span className="text-[13px]">{dual.cdmx} CDMX</span>
                  {dual.local && (
                    <span className={cn('text-[11px] font-normal', selected ? 'text-white/85' : 'text-ink-subtle')}>
                      {dual.local} tu hora
                    </span>
                  )}
                </span>
              ) : (
                <span className="relative z-10">
                  {formatInTimeZone(parseISO(slot.datetime), BUSINESS_TZ, 'HH:mm')}
                </span>
              )}
            </button>
          )
        })}
      </div>
      </LayoutGroup>
      <p className="text-center text-xs text-ink-subtle">
        {showLocalTime
          ? 'CDMX es la hora de Ciudad de México; «tu hora» corresponde a tu zona horaria.'
          : 'Hora de Ciudad de México'}
      </p>
    </div>
  )
}
