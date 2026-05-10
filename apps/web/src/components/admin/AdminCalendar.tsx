'use client'

import { useRef, useState, useCallback } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import esLocale from '@fullcalendar/core/locales/es'
import type { EventInput, EventSourceFuncArg } from '@fullcalendar/core'
import { cn } from '@/lib/utils'
import { AppointmentDetailModal } from './AppointmentDetailModal'

// Status colours matching the design system
const STATUS_COLORS: Record<string, string> = {
  accepted:  '#16a34a',
  pending:   '#d97706',
  rejected:  '#f87171',
  cancelled: '#f87171',
}

type FilterKey = 'accepted' | 'pending' | 'rejected' | 'slots'

const FILTER_LABELS: Record<FilterKey, string> = {
  accepted: 'Confirmadas',
  pending:  'Pendientes',
  rejected: 'Rechazadas',
  slots:    'Slots libres',
}

async function fetchAppointmentEvents(info: EventSourceFuncArg): Promise<EventInput[]> {
  const params = new URLSearchParams({
    dateFrom: info.start.toISOString(),
    dateTo:   info.end.toISOString(),
    limit:    '200',
  })
  const res = await fetch(`/api/admin/appointments?${params}`)
  if (res.status === 401) { window.location.href = '/admin/login'; return [] }
  if (!res.ok) return []

  const data = await res.json() as {
    appointments: Array<{
      id: string; name: string; slotDatetime: string;
      status: string; googleCalendarEventId?: string | null
    }>
  }

  return data.appointments.map(a => {
    const start = new Date(a.slotDatetime)
    const end   = new Date(start.getTime() + 60 * 60 * 1000)
    const isDone = a.status === 'rejected' || a.status === 'cancelled'
    return {
      id:    a.id,
      title: a.name,
      start,
      end,
      color:      STATUS_COLORS[a.status] ?? '#9ca3af',
      classNames: isDone ? ['fc-event-done'] : [],
      extendedProps: { appointmentId: a.id, status: a.status },
    }
  })
}

async function fetchSlotBackgrounds(info: EventSourceFuncArg): Promise<EventInput[]> {
  const start = info.start
  const month = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`
  const res = await fetch(`/api/slots?month=${month}`)
  if (!res.ok) return []

  const data = await res.json() as { slots: Array<{ id: string; datetime: string }> }
  return data.slots.map(s => {
    const dt  = new Date(s.datetime)
    const end = new Date(dt.getTime() + 60 * 60 * 1000)
    return {
      id:      `slot-${s.id}`,
      start:   dt,
      end,
      display: 'background',
      color:   '#e5e7eb',
      extendedProps: { isSlot: true },
    }
  })
}

export function AdminCalendar() {
  const calRef = useRef<InstanceType<typeof FullCalendar>>(null)
  const [selectedId,  setSelectedId]  = useState<string | null>(null)
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(
    new Set(['accepted', 'pending', 'rejected', 'slots'])
  )

  const toggleFilter = (key: FilterKey) => {
    setActiveFilters(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const apptSource = useCallback(
    async (info: EventSourceFuncArg, success: (e: EventInput[]) => void, failure: (e: Error) => void) => {
      try {
        const events = await fetchAppointmentEvents(info)
        const filtered = events.filter(e => {
          const status = (e.extendedProps as { status: string }).status as FilterKey
          return activeFilters.has(status)
        })
        success(filtered)
      } catch (err) {
        failure(err instanceof Error ? err : new Error(String(err)))
      }
    },
    [activeFilters]
  )

  const slotSource = useCallback(
    async (info: EventSourceFuncArg, success: (e: EventInput[]) => void, failure: (e: Error) => void) => {
      if (!activeFilters.has('slots')) { success([]); return }
      try {
        success(await fetchSlotBackgrounds(info))
      } catch (err) {
        failure(err instanceof Error ? err : new Error(String(err)))
      }
    },
    [activeFilters]
  )

  const handleChanged = useCallback(() => {
    calRef.current?.getApi().refetchEvents()
  }, [])

  return (
    <>
      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {(Object.keys(FILTER_LABELS) as FilterKey[]).map(key => {
          const active = activeFilters.has(key)
          return (
            <button
              key={key}
              onClick={() => toggleFilter(key)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all',
                active
                  ? 'border-champagne bg-champagne-tint text-champagne-deep'
                  : 'border-admin-line bg-admin-surface text-ink-subtle hover:border-champagne/50',
              )}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                  backgroundColor: key === 'slots'
                    ? '#d1d5db'
                    : STATUS_COLORS[key] ?? '#9ca3af',
                  opacity: active ? 1 : 0.4,
                }}
              />
              {FILTER_LABELS[key]}
            </button>
          )
        })}
      </div>

      {/* Calendar */}
      <div className="rounded-2xl border border-admin-line bg-admin-panel p-4 overflow-hidden fc-admin-wrap">
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          locale={esLocale}
          initialView="timeGridWeek"
          headerToolbar={{
            left:   'prev,next today',
            center: 'title',
            right:  'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          slotMinTime="08:00:00"
          slotMaxTime="21:00:00"
          height="auto"
          timeZone="America/Mexico_City"
          eventSources={[apptSource, slotSource]}
          eventClick={info => {
            const apptId = (info.event.extendedProps as { appointmentId?: string }).appointmentId
            if (apptId) setSelectedId(apptId)
          }}
          eventDidMount={info => {
            // Style rejected/cancelled events with strikethrough
            if (info.event.classNames.includes('fc-event-done')) {
              info.el.style.opacity = '0.55'
              const titleEl = info.el.querySelector('.fc-event-title') as HTMLElement | null
              if (titleEl) titleEl.style.textDecoration = 'line-through'
            }
          }}
          noEventsText="Sin citas en este período"
          buttonText={{ today: 'Hoy', month: 'Mes', week: 'Semana', day: 'Día' }}
        />
      </div>

      <AppointmentDetailModal
        appointmentId={selectedId}
        onClose={() => setSelectedId(null)}
        onChanged={handleChanged}
      />

      {/* FullCalendar style overrides scoped to admin */}
      <style>{`
        .fc-admin-wrap .fc-button {
          background: oklch(0.66 0.083 80) !important;
          border-color: oklch(0.66 0.083 80) !important;
          font-size: 0.75rem !important;
          padding: 0.25rem 0.75rem !important;
          border-radius: 0.5rem !important;
        }
        .fc-admin-wrap .fc-button:hover {
          background: oklch(0.53 0.069 78) !important;
          border-color: oklch(0.53 0.069 78) !important;
        }
        .fc-admin-wrap .fc-button-active,
        .fc-admin-wrap .fc-button:disabled {
          background: oklch(0.53 0.069 78) !important;
          border-color: oklch(0.53 0.069 78) !important;
        }
        .fc-admin-wrap .fc-toolbar-title {
          font-size: 1rem !important;
          font-weight: 500 !important;
          color: oklch(0.18 0.009 73) !important;
        }
        .fc-admin-wrap .fc-col-header-cell-cushion,
        .fc-admin-wrap .fc-daygrid-day-number {
          color: oklch(0.47 0.014 73) !important;
          font-size: 0.75rem !important;
          text-decoration: none !important;
        }
        .fc-admin-wrap .fc-timegrid-slot-label-cushion {
          font-size: 0.7rem !important;
          color: oklch(0.68 0.011 73) !important;
        }
        .fc-admin-wrap .fc-event {
          cursor: pointer !important;
          border-radius: 4px !important;
          font-size: 0.72rem !important;
        }
        .fc-admin-wrap .fc-bg-event {
          opacity: 0.35 !important;
        }
      `}</style>
    </>
  )
}
