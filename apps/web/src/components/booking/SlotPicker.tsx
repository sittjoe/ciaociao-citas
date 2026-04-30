'use client'

import { useMemo } from 'react'
import { format, isSameDay } from 'date-fns'
import { cn } from '@/lib/utils'

interface SlotPickerProps {
  slots:          { id: string; datetime: string }[]
  selectedDate:   Date
  selectedSlotId: string | null
  onSelectSlot:   (slotId: string) => void
}

export function SlotPicker({ slots, selectedDate, selectedSlotId, onSelectSlot }: SlotPickerProps) {
  const daySlots = useMemo(
    () => slots.filter(s => isSameDay(new Date(s.datetime), selectedDate))
         .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()),
    [slots, selectedDate],
  )

  if (daySlots.length === 0) {
    return (
      <p className="text-center text-gold-700 text-sm py-4">
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
                ? 'bg-gold-500 text-rich-black border-gold-500 shadow-gold'
                : 'border-rich-muted text-gold-light hover:border-gold-600 hover:bg-gold-500/10',
            )}
          >
            {format(new Date(slot.datetime), 'HH:mm')}
          </button>
        )
      })}
    </div>
  )
}
