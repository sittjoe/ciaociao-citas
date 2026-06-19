'use client'

import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import esLocale from '@fullcalendar/core/locales/es'
import type { EventInput, EventSourceFuncArg } from '@fullcalendar/core'
import { formatInTimeZone } from 'date-fns-tz'
import { toast } from 'sonner'
import { BUSINESS_TZ, cn, toBusinessWallTime } from '@/lib/utils'
import { AppointmentDetailModal } from './AppointmentDetailModal'

// FullCalendar has no timezone plugin loaded, so a named `timeZone` runs in
// "UTC-coercion" mode: it renders the UTC fields of whatever it receives.
// We therefore hand it CDMX *wall-clock* strings (no offset) — never Date
// objects, whose UTC fields are shifted and land events on the wrong hour/day.
const HOUR_MS = 60 * 60 * 1000

type FilterKey = 'accepted' | 'pending' | 'rejected' | 'slots'
type ApptStatus  = 'accepted' | 'pending' | 'rejected' | 'cancelled'
type ApptExtended = { appointmentId: string; status: ApptStatus }
type SlotExtended = { isSlot: true }

const FILTER_LABELS: Record<FilterKey, string> = {
  accepted: 'Confirmadas',
  pending:  'Pendientes',
  rejected: 'Rechazadas',
  slots:    'Slots libres',
}

// Soft dot colours for filter chips — match .status-* in globals.css
const CHIP_DOTS: Record<FilterKey, string> = {
  accepted: '#10b981',
  pending:  '#f59e0b',
  rejected: '#ef4444',
  slots:    'var(--ink-line)',
}

const STATUS_LABELS_ES: Record<string, string> = {
  accepted:  'Confirmada',
  pending:   'Pendiente',
  rejected:  'Rechazada',
  cancelled: 'Cancelada',
}

async function fetchAppointmentEvents(info: EventSourceFuncArg): Promise<EventInput[]> {
  // info.start/end carry CDMX wall time in their UTC fields (UTC-coercion);
  // pad by a day so the real UTC instants of the range are fully covered.
  const PAD_MS = 24 * 60 * 60 * 1000
  const params = new URLSearchParams({
    dateFrom: new Date(info.start.getTime() - PAD_MS).toISOString(),
    dateTo:   new Date(info.end.getTime() + PAD_MS).toISOString(),
    limit:    '500',
  })
  const res = await fetch(`/api/admin/appointments?${params}`)
  if (res.status === 401) { window.location.href = '/admin/login'; return [] }
  if (!res.ok) throw new Error('API error')

  const data = await res.json() as {
    appointments: Array<{
      id: string; name: string; slotDatetime: string; status: string
    }>
  }

  return data.appointments.map(a => {
    const isDone = a.status === 'rejected' || a.status === 'cancelled'
    return {
      id:    a.id,
      title: a.name,
      start: toBusinessWallTime(a.slotDatetime),
      end:   toBusinessWallTime(a.slotDatetime, HOUR_MS),
      classNames: [`fc-event-status-${a.status}`, ...(isDone ? ['fc-event-done'] : [])],
      extendedProps: { appointmentId: a.id, status: a.status },
    }
  })
}

async function fetchSlotBackgrounds(info: EventSourceFuncArg): Promise<EventInput[]> {
  // Use UTC fields: under UTC-coercion they hold the CDMX wall date,
  // which is exactly the month key the slots API expects.
  const months = new Set<string>()
  const cur = new Date(Date.UTC(info.start.getUTCFullYear(), info.start.getUTCMonth(), 1))
  while (cur < info.end) {
    months.add(`${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, '0')}`)
    cur.setUTCMonth(cur.getUTCMonth() + 1)
  }

  const slotArrays = await Promise.all(
    [...months].map(async (m): Promise<Array<{ id: string; datetime: string }>> => {
      const res = await fetch(`/api/slots?month=${m}`)
      if (!res.ok) return []
      const data = await res.json() as { slots: Array<{ id: string; datetime: string }> }
      return data.slots
    })
  )

  return slotArrays.flat().map(s => {
    return {
      id:      `slot-${s.id}`,
      start:   toBusinessWallTime(s.datetime),
      end:     toBusinessWallTime(s.datetime, HOUR_MS),
      display: 'background',
      color:   'var(--vellum)',
      extendedProps: { isSlot: true } satisfies SlotExtended,
    }
  })
}

export function AdminCalendar() {
  const calRef = useRef<InstanceType<typeof FullCalendar>>(null)
  const [selectedId,    setSelectedId]    = useState<string | null>(null)
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
          const status = (e.extendedProps as ApptExtended).status as FilterKey
          return activeFilters.has(status)
        })
        success(filtered)
      } catch (err) {
        toast.error('No se pudieron cargar las citas')
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

  // Stable array: a fresh array each render makes FullCalendar tear down and
  // re-register both sources (visible flicker + refetch) on unrelated state
  // changes like opening the detail modal.
  const eventSources = useMemo(() => [apptSource, slotSource], [apptSource, slotSource])

  // Under UTC-coercion "now" defaults to real UTC — 6h ahead of the CDMX wall
  // times our events use. Feed it the CDMX wall clock so the today highlight
  // and the now-indicator line sit where the operator expects.
  const businessNow = useCallback(
    () => formatInTimeZone(new Date(), BUSINESS_TZ, "yyyy-MM-dd'T'HH:mm:ss"),
    []
  )

  // Keyboard shortcuts for the operator: j/k prev/next, t today, m/w/d view switch
  const modalOpenRef = useRef(false)
  modalOpenRef.current = selectedId !== null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modalOpenRef.current) return
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const api = calRef.current?.getApi()
      if (!api) return
      switch (e.key) {
        case 'j': case 'ArrowLeft':  api.prev(); break
        case 'k': case 'ArrowRight': api.next(); break
        case 't': api.today(); break
        case 'm': api.changeView('dayGridMonth'); break
        case 'w': api.changeView('timeGridWeek'); break
        case 'd': api.changeView('timeGridDay'); break
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
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
                  : 'border-admin-line bg-admin-surface text-ink-muted hover:border-champagne/50 hover:text-ink',
              )}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                  backgroundColor: CHIP_DOTS[key],
                  opacity: active ? 1 : 0.35,
                }}
              />
              {FILTER_LABELS[key]}
            </button>
          )
        })}
      </div>

      {/* Calendar */}
      <div className="rounded-2xl border border-admin-line bg-admin-panel p-4 overflow-x-auto fc-admin-wrap">
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
          now={businessNow}
          nowIndicator={true}
          eventSources={eventSources}
          eventClick={info => {
            const apptId = (info.event.extendedProps as Partial<ApptExtended>).appointmentId
            if (apptId) setSelectedId(apptId)
          }}
          eventDidMount={info => {
            const { status } = info.event.extendedProps as Partial<ApptExtended>
            if (status) {
              // event.start holds CDMX wall time in its UTC fields — read them
              // directly; converting again would shift the tooltip by 6h.
              const time = info.event.start?.toISOString().slice(11, 16) ?? ''
              info.el.title = `${info.event.title} — ${time} (${STATUS_LABELS_ES[status] ?? status})`
            }
          }}
          buttonText={{ today: 'Hoy', month: 'Mes', week: 'Semana', day: 'Día' }}
        />
      </div>

      <AppointmentDetailModal
        appointmentId={selectedId}
        onClose={() => setSelectedId(null)}
        onChanged={handleChanged}
      />

      {/* FullCalendar overrides — scoped to .fc-admin-wrap, using design tokens */}
      <style>{`
        /* ── Toolbar buttons — ghost default, fill on active/hoy ── */
        .fc-admin-wrap .fc-button {
          background: transparent !important;
          border: 1px solid var(--ink-line) !important;
          color: var(--champagne-deep) !important;
          font-size: 0.73rem !important;
          font-weight: 500 !important;
          padding: 0.35rem 0.85rem !important;
          border-radius: 0.5rem !important;
          letter-spacing: 0.01em !important;
          transition: background 120ms, border-color 120ms, color 120ms !important;
        }
        .fc-admin-wrap .fc-button:hover:not(:disabled) {
          background: var(--champagne-tint) !important;
          border-color: var(--champagne) !important;
          color: var(--champagne-deep) !important;
        }
        .fc-admin-wrap .fc-button-active,
        .fc-admin-wrap .fc-button-active:hover,
        .fc-admin-wrap .fc-button:disabled {
          background: var(--champagne-solid) !important;
          border-color: var(--champagne-solid) !important;
          color: var(--porcelain) !important;
          opacity: 1 !important;
        }
        .fc-admin-wrap .fc-toolbar-title {
          font-size: 1rem !important;
          font-weight: 500 !important;
          color: var(--ink) !important;
          letter-spacing: -0.01em !important;
        }

        /* ── Column headers — eyebrow style ───────────────────── */
        .fc-admin-wrap .fc-col-header-cell-cushion {
          text-transform: uppercase !important;
          letter-spacing: 0.18em !important;
          font-size: 0.63rem !important;
          font-weight: 600 !important;
          color: var(--ink-muted) !important;
          text-decoration: none !important;
        }
        .fc-admin-wrap .fc-col-header-cell.fc-day-today .fc-col-header-cell-cushion {
          color: var(--champagne-deep) !important;
        }
        .fc-admin-wrap .fc-daygrid-day-number {
          font-size: 0.75rem !important;
          color: var(--ink-muted) !important;
          text-decoration: none !important;
        }

        /* ── Time labels ───────────────────────────────────────── */
        .fc-admin-wrap .fc-timegrid-slot-label-cushion {
          font-size: 0.68rem !important;
          color: var(--ink-subtle) !important;
        }

        /* ── Today column ──────────────────────────────────────── */
        .fc-admin-wrap .fc-day-today {
          background-color: var(--champagne-tint) !important;
        }

        /* ── Now indicator (champagne line) ───────────────────── */
        .fc-admin-wrap .fc-timegrid-now-indicator-line {
          border-color: var(--champagne) !important;
        }
        .fc-admin-wrap .fc-timegrid-now-indicator-arrow {
          border-color: var(--champagne) transparent transparent !important;
        }

        /* ── Event base ────────────────────────────────────────── */
        .fc-admin-wrap .fc-event {
          cursor: pointer !important;
          border-radius: 4px !important;
          font-size: 0.72rem !important;
          border-width: 1px !important;
          border-style: solid !important;
        }

        /* ── Status colours (matching .status-* in globals.css) ── */
        .fc-admin-wrap .fc-event-status-accepted {
          background: #ecfdf5 !important;
          border-color: #a7f3d0 !important;
          color: #065f46 !important;
        }
        .fc-admin-wrap .fc-event-status-pending {
          background: #fffbeb !important;
          border-color: #fde68a !important;
          color: #92400e !important;
        }
        .fc-admin-wrap .fc-event-status-rejected {
          background: #fef2f2 !important;
          border-color: #fecaca !important;
          color: #991b1b !important;
          opacity: 0.7 !important;
        }
        .fc-admin-wrap .fc-event-status-cancelled {
          background: var(--admin-surface) !important;
          border-color: var(--admin-line) !important;
          color: var(--ink-subtle) !important;
          opacity: 0.7 !important;
        }
        .fc-admin-wrap .fc-event-done .fc-event-title {
          text-decoration: line-through !important;
        }

        /* ── Slot background events ───────────────────────────── */
        .fc-admin-wrap .fc-bg-event {
          opacity: 0.5 !important;
        }

        /* ── Grid lines (warm, not cool-gray) ─────────────────── */
        .fc-admin-wrap .fc-scrollgrid,
        .fc-admin-wrap .fc-scrollgrid td,
        .fc-admin-wrap .fc-scrollgrid th {
          border-color: var(--admin-line) !important;
        }
        .fc-admin-wrap .fc-timegrid-slot {
          height: 2.5rem !important;
        }

        /* ── Mobile: denser rows, stronger rejected contrast ──── */
        @media (max-width: 640px) {
          .fc-admin-wrap .fc-timegrid-slot {
            height: 1.75rem !important;
          }
          .fc-admin-wrap .fc-event-status-rejected,
          .fc-admin-wrap .fc-event-status-cancelled {
            opacity: 0.85 !important;
          }
        }
      `}</style>
    </>
  )
}
