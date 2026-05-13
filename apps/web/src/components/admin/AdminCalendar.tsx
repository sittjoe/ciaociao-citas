'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import esLocale from '@fullcalendar/core/locales/es'
import type {
  EventInput,
  EventSourceFuncArg,
  EventDropArg,
  EventMountArg,
} from '@fullcalendar/core'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { AppointmentDetailModal } from './AppointmentDetailModal'

type FilterKey = 'accepted' | 'pending' | 'rejected' | 'slots'
type ApptStatus  = 'accepted' | 'pending' | 'rejected' | 'cancelled'
type CalView = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay'
type ApptExtended = { appointmentId: string; status: ApptStatus }
type SlotExtended = { isSlot: true; slotId: string }

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

const VIEW_STORAGE_KEY = 'calendar.view'
const VALID_VIEWS: ReadonlyArray<CalView> = ['dayGridMonth', 'timeGridWeek', 'timeGridDay']
// How often to refetch events from the server so the calendar reflects
// changes made by other admins. We don't use Firestore client onSnapshot
// because admin auth is cookie-based (server-only) and the client SDK
// would have no credentials to subscribe to the appointments collection.
// 30s strikes a balance between freshness and request volume.
const LIVE_REFETCH_MS = 30_000

function readInitialView(): CalView {
  if (typeof window === 'undefined') return 'timeGridWeek'
  try {
    const v = window.localStorage.getItem(VIEW_STORAGE_KEY)
    if (v && (VALID_VIEWS as ReadonlyArray<string>).includes(v)) return v as CalView
  } catch {
    /* ignore — storage might be unavailable */
  }
  return 'timeGridWeek'
}

async function fetchAppointmentEvents(info: EventSourceFuncArg): Promise<EventInput[]> {
  const params = new URLSearchParams({
    dateFrom: info.start.toISOString(),
    dateTo:   info.end.toISOString(),
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
    const start = new Date(a.slotDatetime)
    const end   = new Date(start.getTime() + 60 * 60 * 1000)
    const isDone = a.status === 'rejected' || a.status === 'cancelled'
    return {
      id:    a.id,
      title: a.name,
      start,
      end,
      classNames: [`fc-event-status-${a.status}`, ...(isDone ? ['fc-event-done'] : [])],
      extendedProps: { appointmentId: a.id, status: a.status },
    }
  })
}

async function fetchSlotBackgrounds(info: EventSourceFuncArg): Promise<EventInput[]> {
  const months = new Set<string>()
  const cur = new Date(info.start.getFullYear(), info.start.getMonth(), 1)
  while (cur < info.end) {
    months.add(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`)
    cur.setMonth(cur.getMonth() + 1)
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
    const dt  = new Date(s.datetime)
    const end = new Date(dt.getTime() + 60 * 60 * 1000)
    return {
      id:      `slot-${s.id}`,
      start:   dt,
      end,
      display: 'background',
      color:   'var(--vellum)',
      extendedProps: { isSlot: true, slotId: s.id } satisfies SlotExtended,
    }
  })
}

interface AvailableSlot { id: string; datetime: string }

async function fetchAvailableSlotsAfter(after: Date): Promise<AvailableSlot[]> {
  // 60-day horizon — same window the AppointmentDetailModal uses for reschedule.
  const end = new Date(after.getTime() + 60 * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0]
  const res = await fetch(`/api/admin/slots?dateTo=${end}`)
  if (!res.ok) throw new Error('SLOTS_FETCH_FAILED')
  const data = await res.json() as { slots: AvailableSlot[] }
  return data.slots
}

/** Find a slot whose datetime matches `target` to the minute (TZ-agnostic — Date.getTime). */
function findSlotIdForDate(slots: AvailableSlot[], target: Date): string | null {
  const targetMs = target.getTime()
  // Allow ±60s tolerance to absorb any rounding.
  const match = slots.find(s => Math.abs(new Date(s.datetime).getTime() - targetMs) < 60_000)
  return match ? match.id : null
}

export function AdminCalendar() {
  const calRef = useRef<InstanceType<typeof FullCalendar>>(null)
  const liveRegionRef = useRef<HTMLDivElement>(null)
  const lastApptCountRef = useRef<number>(0)
  const [selectedId,    setSelectedId]    = useState<string | null>(null)
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(
    new Set(['accepted', 'pending', 'rejected', 'slots'])
  )
  const [initialView] = useState<CalView>(readInitialView)

  const toggleFilter = (key: FilterKey) => {
    setActiveFilters(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const announce = useCallback((msg: string) => {
    if (liveRegionRef.current) liveRegionRef.current.textContent = msg
  }, [])

  const apptSource = useCallback(
    async (info: EventSourceFuncArg, success: (e: EventInput[]) => void, failure: (e: Error) => void) => {
      try {
        const events = await fetchAppointmentEvents(info)
        const filtered = events.filter(e => {
          const status = (e.extendedProps as ApptExtended).status as FilterKey
          return activeFilters.has(status)
        })
        // Aria-live: announce when the visible appointment count grows between refetches.
        const prev = lastApptCountRef.current
        if (prev > 0 && events.length > prev) {
          announce(`Nueva actividad en el calendario: ${events.length - prev} cita${events.length - prev === 1 ? '' : 's'} adicional${events.length - prev === 1 ? '' : 'es'}.`)
        }
        lastApptCountRef.current = events.length
        success(filtered)
      } catch (err) {
        toast.error('No se pudieron cargar las citas')
        failure(err instanceof Error ? err : new Error(String(err)))
      }
    },
    [activeFilters, announce]
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

  // Drag-and-drop reschedule. Resolves the dropped time to a server slot id
  // and POSTs to /api/admin/appointments/[id]/reschedule. Reverts on failure
  // or user cancel so the calendar always reflects server state.
  const handleEventDrop = useCallback(async (info: EventDropArg) => {
    const { appointmentId, status } = info.event.extendedProps as Partial<ApptExtended>
    if (!appointmentId) { info.revert(); return }
    if (status !== 'accepted') {
      toast.error('Solo se pueden reagendar citas confirmadas')
      info.revert()
      return
    }
    const newStart = info.event.start
    if (!newStart) { info.revert(); return }

    const oldTime = info.oldEvent.start?.toLocaleString('es-MX', {
      dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Mexico_City',
    }) ?? ''
    const newTime = newStart.toLocaleString('es-MX', {
      dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Mexico_City',
    })
    if (!window.confirm(`¿Reagendar "${info.event.title}" de ${oldTime} a ${newTime}?`)) {
      info.revert()
      return
    }

    try {
      const slots = await fetchAvailableSlotsAfter(new Date())
      const newSlotId = findSlotIdForDate(slots, newStart)
      if (!newSlotId) {
        toast.error('No hay un slot disponible en ese horario')
        info.revert()
        return
      }
      const res = await fetch(`/api/admin/appointments/${appointmentId}/reschedule`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ newSlotId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(typeof data?.error === 'string' ? data.error : 'Error al reagendar')
      }
      toast.success('Cita reagendada')
      announce(`Cita reagendada a ${newTime}.`)
      calRef.current?.getApi().refetchEvents()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al reagendar'
      toast.error(msg)
      info.revert()
    }
  }, [announce])

  // Persist the chosen view across visits so each operator gets their preferred layout.
  const handleDatesSet = useCallback((arg: { view: { type: string } }) => {
    if (typeof window === 'undefined') return
    const type = arg.view.type
    if ((VALID_VIEWS as ReadonlyArray<string>).includes(type)) {
      try { window.localStorage.setItem(VIEW_STORAGE_KEY, type) } catch { /* ignore */ }
    }
  }, [])

  // Decorate each event on mount: dim past events and add a "Vencido" tooltip suffix.
  const handleEventDidMount = useCallback((info: EventMountArg) => {
    const { status } = info.event.extendedProps as Partial<ApptExtended>
    const start = info.event.start
    const isPast = start ? start.getTime() < Date.now() : false

    if (status && start) {
      const time = start.toLocaleTimeString('es-MX', {
        hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City',
      })
      const suffix = isPast ? ' — Vencido' : ''
      info.el.title = `${info.event.title} — ${time} (${STATUS_LABELS_ES[status] ?? status})${suffix}`
    }

    if (isPast && status) {
      info.el.classList.add('fc-event-expired')
    }
  }, [])

  // Keyboard shortcuts for the operator: j/k prev/next, t today, m/w/d view switch
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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

  // Live refresh: poll the API every LIVE_REFETCH_MS so the calendar reflects
  // changes made by other admins (accept/reject/reschedule). Pauses while the
  // tab is hidden to save quota; refetches immediately on visibility return.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null

    const start = () => {
      if (timer !== null) return
      timer = setInterval(() => {
        if (document.visibilityState === 'visible') {
          calRef.current?.getApi().refetchEvents()
        }
      }, LIVE_REFETCH_MS)
    }
    const stop = () => {
      if (timer !== null) { clearInterval(timer); timer = null }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        calRef.current?.getApi().refetchEvents()
        start()
      } else {
        stop()
      }
    }

    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <>
      {/* Visually-hidden aria-live region for announcing calendar updates to AT users */}
      <div
        ref={liveRegionRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />

      {/* Filter chips */}
      <div
        role="group"
        aria-label="Filtros de estado de citas"
        className="flex flex-wrap gap-2 mb-4"
      >
        {(Object.keys(FILTER_LABELS) as FilterKey[]).map(key => {
          const active = activeFilters.has(key)
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggleFilter(key)}
              aria-pressed={active}
              aria-label={`${active ? 'Ocultar' : 'Mostrar'} ${FILTER_LABELS[key]}`}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all',
                active
                  ? 'border-champagne bg-champagne-tint text-champagne-deep'
                  : 'border-admin-line bg-admin-surface text-ink-muted hover:border-champagne/50 hover:text-ink',
              )}
            >
              <span
                aria-hidden="true"
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
      <div
        role="region"
        aria-label="Calendario de citas"
        className="rounded-2xl border border-admin-line bg-admin-panel p-4 overflow-hidden fc-admin-wrap"
      >
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          locale={esLocale}
          initialView={initialView}
          headerToolbar={{
            left:   'prev,next today',
            center: 'title',
            right:  'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          slotMinTime="08:00:00"
          slotMaxTime="21:00:00"
          height="auto"
          timeZone="America/Mexico_City"
          nowIndicator={true}
          editable={true}
          eventStartEditable={true}
          eventDurationEditable={false}
          eventSources={[apptSource, slotSource]}
          eventClick={info => {
            const apptId = (info.event.extendedProps as Partial<ApptExtended>).appointmentId
            if (apptId) setSelectedId(apptId)
          }}
          eventDrop={handleEventDrop}
          eventDidMount={handleEventDidMount}
          datesSet={handleDatesSet}
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
          background: var(--champagne) !important;
          border-color: var(--champagne) !important;
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

        /* ── Expired events (start < now) — dim but visible ──── */
        .fc-admin-wrap .fc-event-expired {
          opacity: 0.5 !important;
        }
        .fc-admin-wrap .fc-event-expired .fc-event-title::after {
          content: " · vencido";
          font-size: 0.6rem;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          opacity: 0.7;
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
      `}</style>
    </>
  )
}
