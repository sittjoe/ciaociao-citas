'use client'

import { useMemo } from 'react'
import { parseISO } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { BUSINESS_TZ, cn } from '@/lib/utils'

interface SlotPickerProps {
  slots:          { id: string; datetime: string }[]
  selectedDate:   Date
  selectedSlotId: string | null
  onSelectSlot:   (slotId: string) => void
}

export function SlotPicker({ slots, selectedDate, selectedSlotId, onSelectSlot }: SlotPickerProps) {
  const daySlots = useMemo(() => {
    const targetKey = formatInTimeZone(selectedDate, BUSINESS_TZ, 'yyyy-MM-dd')
    return slots
      .filter(s => formatInTimeZone(parseISO(s.datetime), BUSINESS_TZ, 'yyyy-MM-dd') === targetKey)
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
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {daySlots.map(slot => {
        const selected = selectedSlotId === slot.id
        return (
          <button
            key={slot.id}
            onClick={() => onSelectSlot(slot.id)}
            className={cn(
              'py-2.5 rounded-xl text-sm font-medium border transition-all duration-150',
              selected
                ? 'bg-champagne text-white border-champagne shadow-pop scale-[1.03]'
                : 'border-ink-line text-ink hover:border-champagne hover:bg-champagne-soft hover:scale-[1.02]',
            )}
          >
            {formatInTimeZone(parseISO(slot.datetime), BUSINESS_TZ, 'HH:mm')}
          </button>
        )
      })}
    </div>
  )
}
