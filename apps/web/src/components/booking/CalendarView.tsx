'use client'

import { useMemo, useState } from 'react'
import { parseISO } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { motion, LayoutGroup } from '@/components/motion'
import { BUSINESS_TZ, cn } from '@/lib/utils'

interface CalendarViewProps {
  slots:          { id: string; datetime: string }[]
  /** yyyy-MM-dd in BUSINESS_TZ (CDMX) — never a viewer-local Date */
  selectedDate:   string | null
  onSelectDate:   (dateKey: string) => void
}

// The whole grid is built from BUSINESS_TZ calendar keys, never from
// viewer-local Dates: a client browsing from another timezone must see the
// same days, dots and "today" as someone in CDMX, because the slot keys the
// API hands us are CDMX dates.
type YearMonth = { year: number; month: number } // month 1–12

function businessTodayKey(): string {
  return formatInTimeZone(new Date(), BUSINESS_TZ, 'yyyy-MM-dd')
}

function dateKey(ym: YearMonth, day: number): string {
  return `${ym.year}-${String(ym.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function daysInMonth(ym: YearMonth): number {
  return new Date(Date.UTC(ym.year, ym.month, 0)).getUTCDate()
}

/** 0 = Monday … 6 = Sunday, computed calendar-stable via UTC */
function mondayIndexOfFirst(ym: YearMonth): number {
  return (new Date(Date.UTC(ym.year, ym.month - 1, 1)).getUTCDay() + 6) % 7
}

function addMonth(ym: YearMonth, delta: 1 | -1): YearMonth {
  const m = ym.month + delta
  if (m === 0)  return { year: ym.year - 1, month: 12 }
  if (m === 13) return { year: ym.year + 1, month: 1 }
  return { year: ym.year, month: m }
}

/** Format a CDMX calendar key for display, without viewer-TZ drift */
function formatKey(key: string, pattern: string): string {
  return formatInTimeZone(parseISO(`${key}T12:00:00Z`), 'UTC', pattern, { locale: es })
}

export function CalendarView({ slots, selectedDate, onSelectDate }: CalendarViewProps) {
  const todayKey = businessTodayKey()
  const [viewMonth, setViewMonth] = useState<YearMonth>(() => {
    const [y, m] = businessTodayKey().split('-').map(Number)
    return { year: y, month: m }
  })

  const slotDates = useMemo(() => {
    const set = new Map<string, number>()
    const nowMs = Date.now()
    for (const s of slots) {
      if (parseISO(s.datetime).getTime() <= nowMs) continue
      const key = formatInTimeZone(parseISO(s.datetime), BUSINESS_TZ, 'yyyy-MM-dd')
      set.set(key, (set.get(key) ?? 0) + 1)
    }
    return set
  }, [slots])

  const dayKeys = useMemo(
    () => Array.from({ length: daysInMonth(viewMonth) }, (_, i) => dateKey(viewMonth, i + 1)),
    [viewMonth]
  )

  const startPad = useMemo(
    () => Array.from({ length: mondayIndexOfFirst(viewMonth) }, (_, i) => i),
    [viewMonth]
  )

  const weekdays = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

  return (
    <div className="w-full">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setViewMonth(m => addMonth(m, -1))}
          className="p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-cream-soft transition-all duration-150"
          aria-label="Mes anterior"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="font-serif text-ink capitalize text-base">
          {formatKey(dateKey(viewMonth, 1), 'MMMM yyyy')}
        </span>
        <button
          onClick={() => setViewMonth(m => addMonth(m, 1))}
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
      <LayoutGroup>
      <div className="grid grid-cols-7 gap-1.5" style={{ perspective: '900px' }}>
        {startPad.map(i => <div key={`pad-${i}`} />)}

        {dayKeys.map(key => {
          const slotCount = slotDates.get(key) ?? 0
          const hasSlots = slotCount > 0
          const isPast   = key < todayKey
          const isSel    = selectedDate === key
          const isNow    = key === todayKey
          const dateLabel = formatKey(key, "EEEE d 'de' MMMM")

          return (
            <button
              key={key}
              disabled={!hasSlots || isPast}
              onClick={() => onSelectDate(key)}
              aria-current={isNow ? 'date' : undefined}
              aria-label={
                hasSlots && !isPast
                  ? `${dateLabel}, ${slotCount} horario${slotCount === 1 ? '' : 's'} disponible${slotCount === 1 ? '' : 's'}`
                  : `${dateLabel}, sin horarios disponibles`
              }
              className={cn(
                'cal-day-3d relative aspect-square flex flex-col items-center justify-center rounded-xl text-sm transition-colors duration-150',
                isPast && 'opacity-30 cursor-not-allowed',
                !isPast && !hasSlots && 'text-ink-subtle cursor-not-allowed',
                !isPast && hasSlots && !isSel && [
                  'text-ink cursor-pointer',
                  'hover:bg-champagne-tint',
                ],
                isSel && 'text-white font-semibold is-selected',
                isNow && !isSel && 'ring-1 ring-champagne',
              )}
            >
              {isSel && (
                <motion.span
                  layoutId="cal-selected"
                  className="absolute inset-0 rounded-xl bg-champagne-solid shadow-pop"
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                />
              )}
              <span className="relative z-10">{formatKey(key, 'd')}</span>
              {hasSlots && !isPast && (
                <span className={cn(
                  'relative z-10 w-1 h-1 rounded-full mt-0.5',
                  isSel ? 'bg-white/70' : 'bg-champagne',
                )} />
              )}
            </button>
          )
        })}
      </div>
      </LayoutGroup>
    </div>
  )
}
