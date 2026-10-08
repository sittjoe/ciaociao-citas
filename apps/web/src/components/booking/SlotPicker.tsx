'use client'

import { useEffect, useMemo, useState } from 'react'
import { parseISO } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { motion, LayoutGroup } from '@/components/motion'
import { BUSINESS_TZ, cn, formatTime12 } from '@/lib/utils'
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

// Momentos del día (hora de CDMX) para agrupar los horarios.
const PARTS = [
  { key: 'morning',   label: 'Por la mañana' },
  { key: 'afternoon', label: 'Por la tarde' },
  { key: 'evening',   label: 'Por la noche' },
] as const

function partOfDay(iso: string): (typeof PARTS)[number]['key'] {
  const hour = Number(formatInTimeZone(parseISO(iso), BUSINESS_TZ, 'H'))
  if (hour < 12) return 'morning'
  if (hour < 19) return 'afternoon'
  return 'evening'
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

  // Como el libro de reservas de una casa: los horarios agrupados por
  // momento del día, la hora en serif. La elección se desliza (layoutId)
  // de un horario a otro en lugar de encenderse de golpe.
  const groups = PARTS.map(part => ({
    ...part,
    entries: entries.filter(({ slot }) => partOfDay(slot.datetime) === part.key),
  })).filter(group => group.entries.length > 0)

  return (
    <div className="space-y-5">
      <LayoutGroup id="horario">
      {groups.map(group => (
        <div key={group.key} role="group" aria-label={group.label}>
          <p className="mb-2.5 text-sm font-light text-ink-muted">{group.label}</p>
          <div className={cn('grid gap-2', showLocalTime ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-3 sm:grid-cols-4')}>
            {group.entries.map(({ slot, dual }) => {
              const selected = selectedSlotId === slot.id
              const ariaLabel = isVideo && dual
                ? `${dual.cdmx} en Ciudad de México${dual.local ? `, ${dual.local} en tu zona horaria` : ''}`
                : `${formatTime12(slot.datetime)}, hora de Ciudad de México`
              const [num, period] = (showLocalTime && dual ? dual.cdmx : formatTime12(slot.datetime)).split(' ')
              return (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => onSelectSlot(slot.id)}
                  aria-pressed={selected}
                  aria-label={ariaLabel}
                  className={cn(
                    'slot-3d relative min-h-[52px] overflow-hidden rounded-xl border px-2 py-2 transition-colors duration-200',
                    selected
                      ? 'border-champagne-solid text-porcelain'
                      : 'border-ink-line bg-porcelain text-ink hover:border-champagne hover:bg-champagne-tint',
                  )}
                >
                  {selected && (
                    <motion.span
                      layoutId="slot-pill"
                      className="absolute inset-0 bg-champagne-solid"
                      transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
                    />
                  )}
                  <span className="relative z-10 flex flex-col items-center leading-none">
                    <span className="flex items-baseline gap-1">
                      <span className="font-serif text-[1.45rem] font-normal tabular-nums">{num}</span>
                      <span className={cn('text-[0.7rem] font-medium', selected ? 'text-porcelain/85' : 'text-ink-muted')}>{period}</span>
                    </span>
                    {showLocalTime && dual?.local && (
                      <span className={cn('mt-1 text-[11px] font-normal', selected ? 'text-porcelain/85' : 'text-ink-muted')}>
                        {dual.local} tu hora
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
      </LayoutGroup>
      <p className="text-xs text-ink-muted">
        {showLocalTime
          ? 'Las horas grandes son de Ciudad de México; «tu hora» es la de tu zona horaria.'
          : 'Horas de Ciudad de México. Cada cita dura una hora.'}
      </p>
    </div>
  )
}
