'use client'

import { useMemo, useState } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth,
         isToday, isSameDay, addMonths, subMonths, isBefore, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CalendarViewProps {
  slots:          { id: string; datetime: string }[]
  selectedDate:   Date | null
  onSelectDate:   (date: Date) => void
}

export function CalendarView({ slots, selectedDate, onSelectDate }: CalendarViewProps) {
  const [viewDate, setViewDate] = useState(() => new Date())
  const today = startOfDay(new Date())

  const slotDates = useMemo(() => {
    const set = new Set<string>()
    for (const s of slots) {
      set.add(format(new Date(s.datetime), 'yyyy-MM-dd'))
    }
    return set
  }, [slots])

  const days = useMemo(() => {
    const start = startOfMonth(viewDate)
    const end   = endOfMonth(viewDate)
    return eachDayOfInterval({ start, end })
  }, [viewDate])

  // Pad start of month to align with Mon–Sun grid
  const startPad = useMemo(() => {
    // getDay() returns 0=Sun, shift so Mon=0
    const dow = (startOfMonth(viewDate).getDay() + 6) % 7
    return Array.from({ length: dow }, (_, i) => i)
  }, [viewDate])

  const weekdays = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

  return (
    <div className="w-full">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setViewDate(d => subMonths(d, 1))}
          className="p-2 rounded-xl text-gold-600 hover:text-gold-400 hover:bg-white/5 transition-colors"
          aria-label="Mes anterior"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="font-serif text-gold-400 capitalize">
          {format(viewDate, 'MMMM yyyy', { locale: es })}
        </span>
        <button
          onClick={() => setViewDate(d => addMonths(d, 1))}
          className="p-2 rounded-xl text-gold-600 hover:text-gold-400 hover:bg-white/5 transition-colors"
          aria-label="Mes siguiente"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-2">
        {weekdays.map(d => (
          <div key={d} className="text-center text-xs text-gold-700 font-medium tracking-wider py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {startPad.map(i => <div key={`pad-${i}`} />)}

        {days.map(day => {
          const key      = format(day, 'yyyy-MM-dd')
          const hasSlots = slotDates.has(key)
          const isPast   = isBefore(startOfDay(day), today)
          const isSel    = selectedDate ? isSameDay(day, selectedDate) : false
          const isNow    = isToday(day)

          return (
            <button
              key={key}
              disabled={!hasSlots || isPast}
              onClick={() => onSelectDate(day)}
              className={cn(
                'aspect-square flex flex-col items-center justify-center rounded-xl text-sm transition-all duration-150',
                isPast && 'opacity-30 cursor-not-allowed',
                !isPast && !hasSlots && 'text-rich-subtle cursor-not-allowed',
                !isPast && hasSlots && !isSel && 'text-gold-light hover:bg-gold-500/10 cursor-pointer',
                isSel && 'bg-gold-500 text-rich-black font-semibold shadow-gold',
                isNow && !isSel && 'ring-1 ring-gold-700',
              )}
            >
              <span>{format(day, 'd')}</span>
              {hasSlots && !isPast && (
                <span className={cn(
                  'w-1 h-1 rounded-full mt-0.5',
                  isSel ? 'bg-rich-black' : 'bg-gold-500',
                )} />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
