'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, Calendar, CalendarPlus, ChevronDown, Pause, Play } from 'lucide-react'
import { format, addDays, startOfDay, parseISO } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { es } from 'date-fns/locale'
import { motion, AnimatePresence, LayoutGroup } from '@/components/motion'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { AlertDialog } from '@/components/ui/AlertDialog'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { appointmentTypeLabels } from '@/lib/commercial'
import { cn, formatShortDate, BUSINESS_TZ } from '@/lib/utils'
import type { AppointmentType } from '@/types'

interface SlotRow {
  id:        string
  datetime:  string
  available: boolean
  slotType?: AppointmentType
  bookedBy:  string | null
}

const DEFAULT_TIMES = ['10:00', '11:00', '12:00', '13:00', '15:00', '16:00', '17:00']

/** Día calendario CDMX de un ISO — misma llave que usa el negocio. */
const businessDayKey = (iso: string) => formatInTimeZone(parseISO(iso), BUSINESS_TZ, 'yyyy-MM-dd')

export function SlotManager() {
  const [slots,         setSlots]         = useState<SlotRow[]>([])
  const [loading,       setLoading]       = useState(true)
  const [showAdd,       setShowAdd]       = useState(false)
  const [creating,      setCreating]      = useState(false)
  const [deleting,      setDeleting]      = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [futureOnly,    setFutureOnly]    = useState(true)
  const [typeFilter,    setTypeFilter]    = useState<AppointmentType | ''>('')
  // Filtro por día calendario (CDMX), activado desde la barra de ocupación.
  const [dayFilter,     setDayFilter]     = useState<string | null>(null)

  // Selección para borrado en lote (solo slots libres; los reservados no se pueden tocar).
  const [selected,        setSelected]        = useState<Set<string>>(new Set())
  const [bulkDeleting,    setBulkDeleting]    = useState(false)
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)

  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())
  const [selectedTimes, setSelectedTimes] = useState<Set<string>>(new Set(DEFAULT_TIMES))
  const [slotType,      setSlotType]      = useState<AppointmentType>('showroom')
  const [customTime,    setCustomTime]    = useState('')

  // El API por defecto solo devuelve slots futuros. Para poder LIMPIAR los viejos,
  // cuando se ve "Todos" pedimos explícitamente desde un año atrás.
  const fetchSlots = useCallback(async (includePast = false) => {
    setLoading(true)
    try {
      const qs = includePast
        ? `?dateFrom=${format(addDays(startOfDay(new Date()), -365), 'yyyy-MM-dd')}`
        : ''
      const res = await fetch('/api/admin/slots' + qs)
      if (res.status === 401) {
        window.location.href = '/admin/login?from=/admin/slots'
        return
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? 'Error al cargar slots')
      }
      const data = await res.json() as { slots: SlotRow[] }
      setSlots(data.slots ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cargar slots')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSlots(!futureOnly) }, [fetchSlots, futureOnly])
  // Al cambiar de filtro la selección previa deja de tener sentido: se limpia.
  useEffect(() => { setSelected(new Set()) }, [futureOnly, typeFilter, dayFilter])

  const nextDays = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(startOfDay(new Date()), i + 1)
    return format(d, 'yyyy-MM-dd')
  })

  const toggleDate = (d: string) => {
    setSelectedDates(prev => {
      const next = new Set(prev)
      next.has(d) ? next.delete(d) : next.add(d)
      return next
    })
  }

  const toggleTime = (t: string) => {
    setSelectedTimes(prev => {
      const next = new Set(prev)
      next.has(t) ? next.delete(t) : next.add(t)
      return next
    })
  }

  // Strict HH:MM (00-23:00-59); the old /\d{2}:\d{2}/ accepted 99:99 / 12:60
  const isValidTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)

  const addCustomTime = () => {
    if (!isValidTime(customTime)) return
    setSelectedTimes(prev => new Set([...prev, customTime]))
    setCustomTime('')
  }

  // Reset the "create availability" form to a clean default state. Called on
  // close and after a successful create so reopening never shows stale dates,
  // accumulated custom times, or a previous slot type.
  const resetAddForm = useCallback(() => {
    setSelectedDates(new Set())
    setSelectedTimes(new Set(DEFAULT_TIMES))
    setCustomTime('')
    setSlotType('showroom')
  }, [])

  const closeAddModal = useCallback(() => {
    setShowAdd(false)
    resetAddForm()
  }, [resetAddForm])

  const createSlots = useCallback(async () => {
    if (!selectedDates.size || !selectedTimes.size) {
      toast.error('Selecciona al menos una fecha y un horario')
      return
    }
    setCreating(true)
    try {
      const res  = await fetch('/api/admin/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dates: [...selectedDates], times: [...selectedTimes], slotType }),
      })
      if (res.status === 401) {
        window.location.href = '/admin/login?from=/admin/slots'
        return
      }
      const data = await res.json().catch(() => ({})) as { created?: number; skipped?: string[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error al crear slots')
      const created = data.created ?? 0
      const skippedList = data.skipped ?? []
      if (skippedList.length > 0) {
        // Reporte honesto: el API salta duplicados, horas ya pasadas y fechas
        // bloqueadas — se muestra cuáles en lugar de un conteo mudo.
        const preview = skippedList.slice(0, 6).map(k => k.replace('T', ' · ')).join(', ')
        const extra   = skippedList.length > 6 ? ` y ${skippedList.length - 6} más` : ''
        const summary = `${created} slot${created !== 1 ? 's' : ''} creado${created !== 1 ? 's' : ''} · ${skippedList.length} omitido${skippedList.length !== 1 ? 's' : ''} (ya existían, en el pasado o en fecha bloqueada)`
        if (created > 0) {
          toast.warning(summary, { description: `Omitidos: ${preview}${extra}`, duration: 8000 })
        } else {
          toast.error('No se creó ningún slot', { description: `Omitidos: ${preview}${extra}`, duration: 8000 })
        }
      } else {
        toast.success(`${created} slot${created !== 1 ? 's' : ''} creado${created !== 1 ? 's' : ''}`)
      }
      setShowAdd(false)
      resetAddForm()
      fetchSlots(!futureOnly)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al crear slots')
    } finally {
      setCreating(false)
    }
  }, [selectedDates, selectedTimes, slotType, fetchSlots, resetAddForm, futureOnly])

  const deleteSlot = useCallback(async (id: string) => {
    setDeleting(id)
    try {
      const res = await fetch(`/api/admin/slots?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json() as { error?: string }
        throw new Error(err.error)
      }
      toast.success('Slot eliminado')
      setSlots(prev => prev.filter(s => s.id !== id))
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    } finally {
      setDeleting(null)
    }
  }, [])

  const visibleSlots = (futureOnly
    ? slots.filter(s => new Date(s.datetime) >= new Date())
    : slots)
    .filter(s => !typeFilter || (s.slotType ?? 'showroom') === typeFilter)
    .filter(s => !dayFilter || businessDayKey(s.datetime) === dayFilter)

  // Solo los slots LIBRES se pueden seleccionar; un slot reservado nunca se borra.
  const selectableIds = visibleSlots.filter(s => s.available).map(s => s.id)
  const allSelected   = selectableIds.length > 0 && selectableIds.every(id => selected.has(id))

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(selectableIds))
  }

  const deleteBulk = useCallback(async () => {
    const ids = [...selected]
    if (!ids.length) return
    setBulkDeleting(true)
    try {
      let deleted = 0
      const failed: { id: string; error: string }[] = []
      // El API acepta máximo 200 por lote: troceamos la selección.
      for (let i = 0; i < ids.length; i += 200) {
        const res = await fetch('/api/admin/slots/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: ids.slice(i, i + 200) }),
        })
        if (res.status === 401) {
          window.location.href = '/admin/login?from=/admin/slots'
          return
        }
        const data = await res.json().catch(() => ({})) as {
          deleted?: number; failed?: { id: string; error: string }[]; error?: string
        }
        if (!res.ok) throw new Error(data.error ?? 'Error al eliminar slots')
        deleted += data.deleted ?? 0
        if (data.failed?.length) failed.push(...data.failed)
      }
      if (deleted && failed.length) {
        toast.success(`${deleted} eliminado${deleted !== 1 ? 's' : ''} · ${failed.length} omitido${failed.length !== 1 ? 's' : ''} (con reserva)`)
      } else if (deleted) {
        toast.success(`${deleted} slot${deleted !== 1 ? 's' : ''} eliminado${deleted !== 1 ? 's' : ''}`)
      } else {
        toast.error(failed[0]?.error ?? 'No se eliminó ningún slot')
      }
      setSelected(new Set())
      fetchSlots(!futureOnly)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar slots')
    } finally {
      setBulkDeleting(false)
    }
  }, [selected, fetchSlots, futureOnly])

  return (
    <div className="space-y-4">
      {/* Horario recurrente + publicación por semanas */}
      <ScheduleEditor onPublished={() => fetchSlots(!futureOnly)} />

      {/* Ocupación de los próximos 14 días — clic en un día filtra la tabla */}
      <OccupancyStrip slots={slots} dayFilter={dayFilter} onSelectDay={setDayFilter} />

      <div className="flex flex-col gap-3 rounded-2xl border border-admin-line bg-admin-panel p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="h-eyebrow mb-1">Disponibilidad</p>
          <h2 className="font-serif text-xl font-light text-ink">Slots disponibles</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFutureOnly(v => !v)}
            className={cn(
              'text-xs px-3 py-1.5 rounded-lg border transition-all',
              futureOnly
                ? 'bg-champagne-soft text-champagne-deep border-champagne-soft'
                : 'text-ink-muted border-ink-line hover:border-champagne-soft',
            )}
          >
            {futureOnly ? 'Solo futuros' : 'Todos'}
          </button>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as AppointmentType | '')}
            className="input-clean h-9 min-h-0 py-1.5 text-xs sm:w-48"
            aria-label="Filtrar slots por tipo de cita"
          >
            <option value="">Todos los tipos</option>
            <option value="showroom">{appointmentTypeLabels.showroom}</option>
            <option value="video_engagement_rings">{appointmentTypeLabels.video_engagement_rings}</option>
          </select>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus size={14} strokeWidth={1.5} /> Agregar slots
          </Button>
        </div>
      </div>

      {/* Barra de acciones en lote — solo aparece con algo seleccionado */}
      {selected.size > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl border border-champagne-soft bg-champagne-tint px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-champagne-deep">
            <strong>{selected.size}</strong> slot{selected.size !== 1 ? 's' : ''} seleccionado{selected.size !== 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelected(new Set())}
              className="rounded-lg border border-ink-line px-3 py-1.5 text-xs text-ink-muted transition-colors hover:border-champagne-soft hover:text-ink focus-visible:outline-none focus-visible:shadow-focus-ring"
            >
              Limpiar selección
            </button>
            <Button size="sm" variant="danger" loading={bulkDeleting} onClick={() => setShowBulkConfirm(true)}>
              <Trash2 size={14} strokeWidth={1.5} /> Eliminar seleccionados
            </Button>
          </div>
        </div>
      )}

      {/* Slots list */}
      <div className="overflow-x-auto rounded-2xl border border-admin-line bg-admin-panel">
        {loading ? (
          <TableSkeleton rows={5} cols={4} />
        ) : visibleSlots.length === 0 ? (
          <EmptyState
            title={dayFilter ? 'Sin slots ese día' : futureOnly ? 'Sin slots futuros' : 'Sin slots'}
            description={dayFilter ? 'No hay slots publicados para el día seleccionado.' : futureOnly ? 'Crea slots para los próximos días.' : 'No hay slots registrados.'}
            action={
              <Button size="sm" onClick={() => setShowAdd(true)}>
                <Plus size={14} /> Agregar slots
              </Button>
            }
          />
        ) : (
          <LayoutGroup>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-admin-line bg-admin-surface/70">
                  <th className="w-10 px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      disabled={selectableIds.length === 0}
                      aria-label="Seleccionar todos los slots libres"
                      className="h-4 w-4 cursor-pointer accent-champagne-solid disabled:cursor-not-allowed disabled:opacity-40"
                    />
                  </th>
                  {['Fecha y hora', 'Tipo', 'Estado', 'Acciones'].map(h => (
                    <th key={h} className="px-4 py-3 text-left h-eyebrow text-ink-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {visibleSlots.map(slot => (
                    <motion.tr
                      key={slot.id}
                      layoutId={`slot-${slot.id}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="border-b border-admin-line last:border-0 hover:bg-champagne-tint/60"
                    >
                      <td className="px-4 py-3">
                        {slot.available && (
                          <input
                            type="checkbox"
                            checked={selected.has(slot.id)}
                            onChange={() => toggleSelect(slot.id)}
                            aria-label={`Seleccionar slot ${formatShortDate(slot.datetime)}`}
                            className="h-4 w-4 cursor-pointer accent-champagne-solid"
                          />
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink">{formatShortDate(slot.datetime)}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full border border-admin-line bg-admin-surface px-2.5 py-0.5 text-xs text-ink-muted">
                          {appointmentTypeLabels[slot.slotType ?? 'showroom']}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <motion.span
                          layoutId={`status-${slot.id}`}
                          className={cn(
                            'text-xs px-2.5 py-0.5 rounded-full border',
                            slot.available
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-champagne-tint text-champagne-deep border-champagne-soft',
                          )}
                        >
                          {slot.available ? 'Disponible' : 'Reservado'}
                        </motion.span>
                      </td>
                      <td className="px-4 py-3">
                        {slot.available && (
                          <button
                            onClick={() => setPendingDelete(slot.id)}
                            disabled={deleting === slot.id}
                            className="text-red-400/60 hover:text-red-500 transition-colors disabled:opacity-40 disabled:cursor-wait disabled:hover:text-red-400/60 p-1 rounded-lg hover:bg-red-50 focus-visible:outline-none focus-visible:shadow-focus-ring"
                            aria-label="Eliminar slot"
                          >
                            <Trash2 size={15} strokeWidth={1.5} />
                          </button>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </LayoutGroup>
        )}
      </div>

      {/* Delete confirm dialog */}
      <AlertDialog
        open={!!pendingDelete}
        title="¿Eliminar este slot?"
        description="Esta acción no se puede deshacer. El slot dejará de estar disponible para reservas."
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        variant="danger"
        loading={!!deleting}
        onConfirm={() => {
          if (pendingDelete) deleteSlot(pendingDelete)
          setPendingDelete(null)
        }}
        onCancel={() => setPendingDelete(null)}
      />

      {/* Bulk delete confirm dialog */}
      <AlertDialog
        open={showBulkConfirm}
        title={`¿Eliminar ${selected.size} slot${selected.size !== 1 ? 's' : ''}?`}
        description="Esta acción no se puede deshacer. Los slots que tengan una reserva se omiten automáticamente."
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        variant="danger"
        loading={bulkDeleting}
        onConfirm={() => { setShowBulkConfirm(false); deleteBulk() }}
        onCancel={() => setShowBulkConfirm(false)}
      />

      {/* Add slots modal */}
      <Modal open={showAdd} onClose={closeAddModal} title="Crear disponibilidad" size="lg">
        <div className="space-y-5">
          <div className="rounded-2xl border border-admin-line bg-admin-surface p-4">
            <p className="label-clean mb-3">Tipo de cita</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(['showroom', 'video_engagement_rings'] as AppointmentType[]).map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSlotType(type)}
                  className={cn(
                    'rounded-xl border px-4 py-3 text-left transition-colors',
                    slotType === type
                      ? 'border-champagne bg-champagne-tint text-champagne-deep'
                      : 'border-admin-line bg-admin-panel text-ink-muted hover:border-champagne-soft',
                  )}
                >
                  <span className="block text-sm font-semibold">{appointmentTypeLabels[type]}</span>
                  <span className="mt-1 block text-xs">
                    {type === 'showroom' ? 'Visitas presenciales con ID.' : 'Llamadas guiadas para anillos.'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-admin-line bg-admin-surface p-4">
            <p className="label-clean mb-3">Selecciona fechas</p>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
              <LayoutGroup>
                {nextDays.map(d => {
                  const date  = new Date(d + 'T12:00:00')
                  const isSel = selectedDates.has(d)
                  return (
                    <motion.button
                      key={d}
                      layoutId={`day-${d}`}
                      onClick={() => toggleDate(d)}
                      className={cn(
                        'flex flex-col items-center py-2 px-1 rounded-xl text-xs border transition-colors',
                        isSel
                          ? 'bg-champagne-solid text-white border-champagne-solid shadow-pop'
                          : 'border-ink-line text-ink hover:border-champagne hover:bg-champagne-tint',
                      )}
                    >
                      <span className="uppercase opacity-70">{format(date, 'EEE', { locale: es })}</span>
                      <span className="font-semibold text-sm mt-0.5">{format(date, 'd')}</span>
                      <span className="opacity-70">{format(date, 'MMM', { locale: es })}</span>
                    </motion.button>
                  )
                })}
              </LayoutGroup>
            </div>
          </div>

          <div className="rounded-2xl border border-admin-line bg-admin-surface p-4">
            <p className="label-clean mb-3">Selecciona horarios</p>
            <LayoutGroup>
              <div className="flex flex-wrap gap-2">
                <AnimatePresence>
                  {[...selectedTimes].sort().map(t => (
                    <motion.button
                      key={t}
                      layoutId={`time-${t}`}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.15 }}
                      onClick={() => toggleTime(t)}
                      className="px-3 py-1.5 rounded-lg text-sm border bg-champagne-solid text-white border-champagne-solid hover:bg-champagne-deep transition-colors"
                    >
                      {t} ✕
                    </motion.button>
                  ))}
                </AnimatePresence>
              </div>
            </LayoutGroup>
            <div className="mt-3">
              <div className="flex gap-2">
                <input
                  value={customTime}
                  onChange={e => setCustomTime(e.target.value)}
                  placeholder="HH:MM"
                  className="input-clean w-24"
                  inputMode="numeric"
                  aria-label="Hora personalizada en formato HH:MM"
                  aria-invalid={customTime.length > 0 && !isValidTime(customTime)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomTime() } }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addCustomTime}
                  disabled={!isValidTime(customTime)}
                >
                  <Plus size={14} /> Agregar hora
                </Button>
              </div>
              {customTime.length > 0 && !isValidTime(customTime) && (
                <p className="mt-1.5 text-xs text-red-600">Usa el formato HH:MM de 24 horas, por ejemplo 09:30 o 17:00.</p>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-admin-line">
            <p className="text-xs text-ink-muted">
              {selectedDates.size} fecha{selectedDates.size !== 1 ? 's' : ''} ×{' '}
              {selectedTimes.size} horario{selectedTimes.size !== 1 ? 's' : ''} ={' '}
              <strong className="text-champagne-solid">{selectedDates.size * selectedTimes.size} slots</strong>
              {' '}· {appointmentTypeLabels[slotType]}
            </p>
            <Button loading={creating} onClick={createSlots}>
              <Calendar size={14} strokeWidth={1.5} /> Crear slots
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Horario recurrente — editor semanal + «Publicar semanas»
// ---------------------------------------------------------------------------

/** Espejo cliente de SlotSchedule (lib/slot-schedule). */
interface ScheduleDraft {
  weekdays:    number[]
  times:       string[]
  slotType:    AppointmentType
  horizonDays: number
}

const WEEKDAY_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' },
]

const WEEK_OPTIONS = [2, 4, 6, 8]

const VALID_TIME = /^([01]\d|2[0-3]):[0-5]\d$/

function ScheduleEditor({ onPublished }: { onPublished: () => void }) {
  const [expanded,   setExpanded]   = useState(false)
  const [loading,    setLoading]    = useState(true)
  const [schedules,  setSchedules]  = useState<ScheduleDraft[]>([])
  const [source,     setSource]     = useState<'firestore' | 'default'>('firestore')
  const [saving,     setSaving]     = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [weeks,      setWeeks]      = useState(4)
  const [timeDrafts, setTimeDrafts] = useState<Record<number, string>>({})

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/slot-schedule')
        if (res.status === 401) {
          window.location.href = '/admin/login?from=/admin/slots'
          return
        }
        const data = await res.json().catch(() => ({})) as {
          schedules?: ScheduleDraft[]; source?: string; error?: string
        }
        if (!res.ok) throw new Error(data.error ?? 'Error al cargar el horario')
        if (cancelled) return
        setSchedules(data.schedules ?? [])
        setSource(data.source === 'firestore' ? 'firestore' : 'default')
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : 'Error al cargar el horario')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const updateSchedule = (idx: number, patch: Partial<ScheduleDraft>) => {
    setSchedules(prev => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  const toggleWeekday = (idx: number, day: number) => {
    const sch = schedules[idx]
    const weekdays = sch.weekdays.includes(day)
      ? sch.weekdays.filter(d => d !== day)
      : [...sch.weekdays, day]
    updateSchedule(idx, { weekdays })
  }

  const removeTime = (idx: number, time: string) => {
    updateSchedule(idx, { times: schedules[idx].times.filter(t => t !== time) })
  }

  const addTime = (idx: number) => {
    const draft = timeDrafts[idx] ?? ''
    if (!VALID_TIME.test(draft)) return
    updateSchedule(idx, { times: [...new Set([...schedules[idx].times, draft])].sort() })
    setTimeDrafts(prev => ({ ...prev, [idx]: '' }))
  }

  const save = useCallback(async () => {
    for (const sch of schedules) {
      if (!sch.weekdays.length || !sch.times.length) {
        toast.error('Cada horario necesita al menos un día y una hora')
        return
      }
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/slot-schedule', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedules }),
      })
      if (res.status === 401) {
        window.location.href = '/admin/login?from=/admin/slots'
        return
      }
      const data = await res.json().catch(() => ({})) as {
        ok?: boolean; schedules?: ScheduleDraft[]; error?: string
      }
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Error al guardar el horario')
      if (data.schedules?.length) setSchedules(data.schedules)
      setSource('firestore')
      toast.success('Horario guardado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar el horario')
    } finally {
      setSaving(false)
    }
  }, [schedules])

  const publish = useCallback(async () => {
    setPublishing(true)
    try {
      const res = await fetch('/api/admin/slots/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weeks }),
      })
      if (res.status === 401) {
        window.location.href = '/admin/login?from=/admin/slots'
        return
      }
      const data = await res.json().catch(() => ({})) as {
        created?: number; skipped?: number; error?: string
      }
      if (!res.ok) throw new Error(data.error ?? 'Error al publicar horarios')
      const created = data.created ?? 0
      const skipped = data.skipped ?? 0
      toast.success(skipped > 0
        ? `${created} horario${created !== 1 ? 's' : ''} creado${created !== 1 ? 's' : ''} · ${skipped} ya existía${skipped !== 1 ? 'n' : ''}`
        : `${created} horario${created !== 1 ? 's' : ''} creado${created !== 1 ? 's' : ''}`)
      onPublished()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al publicar horarios')
    } finally {
      setPublishing(false)
    }
  }, [weeks, onPublished])

  return (
    <div className="rounded-2xl border border-admin-line bg-admin-panel">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left focus-visible:outline-none focus-visible:shadow-focus-ring"
      >
        <div>
          <p className="h-eyebrow mb-0.5">Agenda</p>
          <span className="font-serif text-xl font-light text-ink">Horario recurrente</span>
        </div>
        <div className="flex items-center gap-2">
          {!loading && source === 'default' && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs text-amber-700">
              Por defecto
            </span>
          )}
          <ChevronDown
            size={18}
            strokeWidth={1.5}
            className={cn('text-ink-muted transition-transform duration-200', expanded && 'rotate-180')}
          />
        </div>
      </button>

      {/* Pausa global de la agenda — visible incluso con el editor colapsado */}
      <AgendaPauseBar />

      {expanded && (
        <div className="space-y-4 border-t border-admin-line px-4 py-4">
          {loading ? (
            <TableSkeleton rows={2} cols={3} />
          ) : (
            <>
              {source === 'default' && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Usando horario por defecto — guárdalo para personalizarlo.
                </p>
              )}

              {schedules.map((sch, idx) => (
                <div key={idx} className="space-y-4 rounded-2xl border border-admin-line bg-admin-surface p-4">
                  <span className="inline-block rounded-full border border-admin-line bg-admin-panel px-2.5 py-0.5 text-xs text-ink-muted">
                    {appointmentTypeLabels[sch.slotType]}
                  </span>

                  <div>
                    <p className="label-clean mb-2">Días de la semana</p>
                    <div className="flex flex-wrap gap-1.5">
                      {WEEKDAY_OPTIONS.map(({ value, label }) => {
                        const active = sch.weekdays.includes(value)
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => toggleWeekday(idx, value)}
                            aria-pressed={active}
                            className={cn(
                              'min-h-[44px] min-w-[44px] rounded-xl border px-2 text-xs transition-colors',
                              active
                                ? 'border-champagne-solid bg-champagne-solid text-white shadow-pop'
                                : 'border-ink-line text-ink hover:border-champagne hover:bg-champagne-tint',
                            )}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="label-clean mb-2">Horas</p>
                    <div className="flex flex-wrap gap-2">
                      {sch.times.map(t => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => removeTime(idx, t)}
                          aria-label={`Quitar la hora ${t}`}
                          className="min-h-[44px] rounded-lg border border-champagne-solid bg-champagne-solid px-3 text-sm text-white transition-colors hover:bg-champagne-deep"
                        >
                          {t} ✕
                        </button>
                      ))}
                      {sch.times.length === 0 && (
                        <p className="self-center text-xs text-ink-muted">Sin horas — agrega al menos una.</p>
                      )}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input
                        type="time"
                        value={timeDrafts[idx] ?? ''}
                        onChange={e => setTimeDrafts(prev => ({ ...prev, [idx]: e.target.value }))}
                        className="input-clean w-32"
                        aria-label="Nueva hora para el horario recurrente"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => addTime(idx)}
                        disabled={!VALID_TIME.test(timeDrafts[idx] ?? '')}
                      >
                        <Plus size={14} /> Agregar hora
                      </Button>
                    </div>
                  </div>

                  <div>
                    <p className="label-clean mb-2">Horizonte</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={90}
                        value={sch.horizonDays}
                        onChange={e => updateSchedule(idx, { horizonDays: Number(e.target.value) })}
                        className="input-clean w-24"
                        aria-label="Días publicados hacia adelante"
                      />
                      <span className="text-xs text-ink-muted">días hacia adelante (generador automático)</span>
                    </div>
                  </div>
                </div>
              ))}

              <div className="flex justify-end">
                <Button variant="outline" size="sm" loading={saving} onClick={save}>
                  Guardar horario
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Publicación — visible incluso con el editor colapsado */}
      <div className="flex flex-col gap-2 border-t border-admin-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-ink-muted">
          Crea los slots de las próximas semanas según este horario. Los existentes no se duplican.
        </p>
        <div className="flex items-center gap-2">
          <select
            value={weeks}
            onChange={e => setWeeks(Number(e.target.value))}
            className="input-clean h-11 w-32 min-h-0 py-1.5 text-xs"
            aria-label="Semanas a publicar"
          >
            {WEEK_OPTIONS.map(w => (
              <option key={w} value={w}>{w} semanas</option>
            ))}
          </select>
          <Button loading={publishing} onClick={publish}>
            <CalendarPlus size={14} strokeWidth={1.5} /> Publicar próximas {weeks} semanas
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pausa global de la agenda — config/agendaPause vía /api/admin/agenda-pause
// ---------------------------------------------------------------------------

function AgendaPauseBar() {
  const [loading,    setLoading]    = useState(true)
  const [paused,     setPaused]     = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/agenda-pause')
        if (res.status === 401) {
          window.location.href = '/admin/login?from=/admin/slots'
          return
        }
        const data = await res.json().catch(() => ({})) as { paused?: boolean; error?: string }
        if (!res.ok) throw new Error(data.error ?? 'Error al leer el estado de la agenda')
        if (!cancelled) setPaused(data.paused === true)
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : 'Error al leer el estado de la agenda')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const applyPause = useCallback(async (next: boolean) => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/agenda-pause', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: next }),
      })
      if (res.status === 401) {
        window.location.href = '/admin/login?from=/admin/slots'
        return
      }
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error al actualizar la agenda')
      setPaused(next)
      toast.success(next
        ? 'Agenda pausada — las clientas no pueden reservar'
        : 'Agenda reactivada — las clientas ya pueden reservar')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar la agenda')
    } finally {
      setSaving(false)
      setConfirming(false)
    }
  }, [])

  return (
    <>
      <div
        className={cn(
          'flex flex-col gap-3 border-t border-admin-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
          paused && 'bg-red-50/70',
        )}
      >
        <div className="flex items-center gap-2.5">
          {paused
            ? <Pause size={16} strokeWidth={1.75} className="shrink-0 text-red-600" />
            : <Play size={16} strokeWidth={1.75} className="shrink-0 text-emerald-600" />}
          <div>
            <p className={cn('text-sm font-medium', paused ? 'text-red-700' : 'text-ink')}>
              {loading ? 'Consultando agenda…' : paused ? 'Agenda pausada — las clientas no pueden reservar' : 'Agenda activa'}
            </p>
            <p className="text-xs text-ink-muted">
              {paused
                ? 'Los horarios publicados quedan ocultos y las nuevas reservas se rechazan. Las citas ya agendadas no se tocan.'
                : 'Las clientas pueden reservar los horarios publicados.'}
            </p>
          </div>
        </div>
        <Button
          variant={paused ? 'gold' : 'outline'}
          size="sm"
          loading={saving}
          disabled={loading}
          onClick={() => setConfirming(true)}
          className="min-h-[44px] shrink-0"
        >
          {paused
            ? <><Play size={14} strokeWidth={1.5} /> Reanudar agenda</>
            : <><Pause size={14} strokeWidth={1.5} /> Pausar agenda</>}
        </Button>
      </div>

      <AlertDialog
        open={confirming}
        title={paused ? '¿Reanudar la agenda?' : '¿Pausar la agenda?'}
        description={paused
          ? 'Los horarios publicados volverán a mostrarse y las clientas podrán reservar de inmediato.'
          : 'Las clientas dejarán de ver horarios disponibles y no podrán reservar hasta que reanudes la agenda. Las citas ya agendadas no se ven afectadas.'}
        confirmLabel={paused ? 'Sí, reanudar' : 'Sí, pausar'}
        cancelLabel="Cancelar"
        variant={paused ? 'warning' : 'danger'}
        loading={saving}
        onConfirm={() => applyPause(!paused)}
        onCancel={() => setConfirming(false)}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Ocupación — próximos 14 días a partir de los slots ya cargados
// ---------------------------------------------------------------------------

interface DayOccupancy {
  key:   string
  total: number
  free:  number
}

function OccupancyStrip({ slots, dayFilter, onSelectDay }: {
  slots:       SlotRow[]
  dayFilter:   string | null
  onSelectDay: (day: string | null) => void
}) {
  const days = useMemo<DayOccupancy[]>(() => {
    const now = new Date()
    const byDay = new Map<string, { total: number; free: number }>()
    for (const s of slots) {
      const dt = parseISO(s.datetime)
      // Las horas ya pasadas no son oferta: no cuentan ni como libres ni como total.
      if (dt < now) continue
      const key = businessDayKey(s.datetime)
      const entry = byDay.get(key) ?? { total: 0, free: 0 }
      entry.total++
      if (s.available) entry.free++
      byDay.set(key, entry)
    }
    return Array.from({ length: 14 }, (_, i) => {
      const key = formatInTimeZone(new Date(now.getTime() + i * 86_400_000), BUSINESS_TZ, 'yyyy-MM-dd')
      return { key, ...(byDay.get(key) ?? { total: 0, free: 0 }) }
    })
  }, [slots])

  return (
    <div className="rounded-2xl border border-admin-line bg-admin-panel p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="h-eyebrow">Ocupación · próximos 14 días</p>
        {dayFilter && (
          <button
            onClick={() => onSelectDay(null)}
            className="rounded-lg border border-ink-line px-3 py-1.5 text-xs text-ink-muted transition-colors hover:border-champagne-soft hover:text-ink focus-visible:outline-none focus-visible:shadow-focus-ring"
          >
            Quitar filtro de día
          </button>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {days.map(d => {
          const date     = new Date(d.key + 'T12:00:00')
          const isActive = dayFilter === d.key
          const tone = d.total === 0
            ? 'border-admin-line bg-admin-surface text-ink-muted'
            : d.free === 0
              ? 'border-red-200 bg-red-50 text-red-700'
              : d.free <= 2
                ? 'border-amber-200 bg-amber-50 text-amber-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          return (
            <button
              key={d.key}
              type="button"
              onClick={() => onSelectDay(isActive ? null : d.key)}
              aria-pressed={isActive}
              aria-label={`${format(date, "EEEE d 'de' MMMM", { locale: es })}: ${
                d.total === 0 ? 'sin slots' : d.free === 0 ? 'lleno' : `${d.free} de ${d.total} libres`
              }`}
              className={cn(
                'flex min-h-[44px] min-w-[72px] shrink-0 flex-col items-center rounded-xl border px-2 py-1.5 text-xs transition-all',
                tone,
                isActive
                  ? 'ring-2 ring-champagne-solid ring-offset-1'
                  : 'hover:-translate-y-px hover:shadow-pop',
              )}
            >
              <span className="uppercase opacity-70">{format(date, 'EEE', { locale: es })}</span>
              <span className="text-sm font-semibold">{format(date, 'd MMM', { locale: es })}</span>
              <span className="mt-0.5 tabular-nums">
                {d.total === 0 ? 'Sin slots' : d.free === 0 ? 'Lleno' : `${d.free}/${d.total} libres`}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
