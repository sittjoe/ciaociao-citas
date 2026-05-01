'use client'

import { useMemo, useState } from 'react'
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval,
         isToday, isSameDay, addMonths, subMonths, isBefore, startOfDay } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { BUSINESS_TZ, cn } from '@/lib/utils'

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
      set.add(formatInTimeZone(parseISO(s.datetime), BUSINESS_TZ, 'yyyy-MM-dd'))
    }
    return set
  }, [slots])

  const days = useMemo(() => {
    const start = startOfMonth(viewDate)
    const end   = endOfMonth(viewDate)
    return eachDayOfInterval({ start, end })
  }, [viewDate])

  const startPad = useMemo(() => {
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
          className="p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-cream-soft transition-all duration-150"
          aria-label="Mes anterior"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="font-serif text-ink capitalize text-base">
          {format(viewDate, 'MMMM yyyy', { locale: es })}
        </span>
        <button
          onClick={() => setViewDate(d => addMonths(d, 1))}
          className="p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-cream-soft transition-all duration-150"
          aria-label="Mes siguiente"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-2">
        {weekdays.map(d => (
          <div key={d} className="text-center text-xs text-ink-subtle font-semibold tracking-wider py-1">
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
                !isPast && !hasSlots && 'text-ink-subtle cursor-not-allowed',
                !isPast && hasSlots && !isSel && [
                  'text-ink cursor-pointer',
                  'hover:bg-champagne-soft hover:scale-105',
                ],
                isSel && 'bg-champagne text-white font-semibold shadow-pop scale-105',
                isNow && !isSel && 'ring-1 ring-champagne',
              )}
            >
              <span>{format(day, 'd')}</span>
              {hasSlots && !isPast && (
                <span className={cn(
                  'w-1 h-1 rounded-full mt-0.5',
                  isSel ? 'bg-white/70' : 'bg-champagne',
                )} />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
