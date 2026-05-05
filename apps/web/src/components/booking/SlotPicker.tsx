'use client'

import { useMemo } from 'react'
import { parseISO } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { motion, LayoutGroup } from '@/components/motion'
import { BUSINESS_TZ, cn } from '@/lib/utils'

interface SlotPickerProps {
  slots:          { id: string; datetime: string }[]
  /** yyyy-MM-dd in BUSINESS_TZ — same key CalendarView emits */
  selectedDate:   string
  selectedSlotId: string | null
  onSelectSlot:   (slotId: string) => void
}

export function SlotPicker({ slots, selectedDate, selectedSlotId, onSelectSlot }: SlotPickerProps) {
  const daySlots = useMemo(() => {
    const nowMs = Date.now()
    return slots
      .filter(s => formatInTimeZone(parseISO(s.datetime), BUSINESS_TZ, 'yyyy-MM-dd') === selectedDate)
      .filter(s => parseISO(s.datetime).getTime() > nowMs)
      .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
  }, [slots, selectedDate])

  if (daySlots.length === 0) {
    return (
      <p className="text-center text-ink-muted text-sm py-4">
        No hay horarios disponibles para este día.
      </p>
    )
  }

  return (
    <LayoutGroup>
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {daySlots.map(slot => {
        const selected = selectedSlotId === slot.id
        return (
          <button
            key={slot.id}
            onClick={() => onSelectSlot(slot.id)}
            className={cn(
              'relative overflow-hidden py-2.5 rounded-xl text-sm font-medium border transition-colors duration-150',
              selected
                ? 'text-white border-champagne shadow-pop'
                : 'border-ink-line text-ink hover:border-champagne hover:bg-champagne-tint',
            )}
          >
            {selected && (
              <motion.span
                layoutId="slot-pill"
                className="absolute inset-0 bg-champagne"
                transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              />
            )}
            <span className="relative z-10">
              {formatInTimeZone(parseISO(slot.datetime), BUSINESS_TZ, 'HH:mm')}
            </span>
          </button>
        )
      })}
    </div>
    </LayoutGroup>
  )
}
