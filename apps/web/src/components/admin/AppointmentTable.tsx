'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  createColumnHelper,
  flexRender,
  type SortingState,
} from '@tanstack/react-table'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle, ChevronRight, XCircle, Download, ChevronDown, ChevronUp, ChevronsUpDown, Search, SlidersHorizontal, Users, FileText, MailCheck, MailQuestion, MessageCircle } from 'lucide-react'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { AppointmentDetail, type SerialAppointment } from './AppointmentDetail'
import { formatInTimeZone } from 'date-fns-tz'
import { formatShortDate, csvRow, cn, BUSINESS_TZ } from '@/lib/utils'
import { appointmentTypeLabels, commercialStatusLabels, engagementBriefRows, formatWhatsAppUrl } from '@/lib/commercial'
import { appointmentTypeOptions, budgetRangeOptions, commercialStatusOptions, productTypeOptions } from '@/lib/schemas'
import type { AppointmentStatus, AppointmentType, CommercialPriority, CommercialStatus } from '@/types'

type SerialAppt = SerialAppointment

const priorityClass: Record<CommercialPriority, string> = {
  high:   'border-red-200 bg-red-50 text-red-600',
  medium: 'border-amber-200 bg-amber-50 text-amber-700',
  normal: 'border-admin-line bg-admin-surface text-ink-muted',
}
const priorityLabel: Record<CommercialPriority, string> = {
  high: 'Alta', medium: 'Media', normal: 'Normal',
}

function TypeChip({ type }: { type: AppointmentType }) {
  return (
    <span className="whitespace-nowrap rounded-full border border-admin-line bg-admin-surface px-2 py-0.5 text-[10px] font-semibold text-ink-muted">
      {appointmentTypeLabels[type]}
    </span>
  )
}

function PriorityBadge({ value }: { value: CommercialPriority }) {
  return (
    <Badge className={cn('border text-[10px] uppercase tracking-wide', priorityClass[value])}>
      {priorityLabel[value]}
    </Badge>
  )
}

/** Píldoras de estado/asistencia/invitados — compartidas entre tabla y tarjetas. */
function StatusIndicators({ appt }: { appt: SerialAppt }) {
  const showConfirm = appt.status === 'accepted'
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <StatusBadge status={appt.status} />
      {showConfirm && appt.clientConfirmed && (
        <span
          title="El cliente confirmó su asistencia"
          className="inline-flex items-center gap-0.5 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
        >
          <MailCheck size={9} strokeWidth={1.5} />
          Confirmó
        </span>
      )}
      {showConfirm && !appt.clientConfirmed && (
        <span
          title="El cliente aún no confirma su asistencia"
          className="inline-flex items-center gap-0.5 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
        >
          <MailQuestion size={9} strokeWidth={1.5} />
          Sin confirmar
        </span>
      )}
      {(appt.guestCount ?? 0) > 0 && (
        <span className="inline-flex items-center gap-0.5 rounded-full border border-champagne-soft bg-champagne-tint px-1.5 py-0.5 text-[10px] font-medium text-champagne-deep">
          <Users size={9} strokeWidth={1.5} />
          {appt.guestCount}
        </span>
      )}
      {appt.attended === true && (
        <span title="El cliente asistió" className="inline-flex items-center gap-0.5 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
          Asistió
        </span>
      )}
      {appt.attended === false && (
        <span title="El cliente no se presentó" className="inline-flex items-center gap-0.5 rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
          No asistió
        </span>
      )}
    </div>
  )
}

const col = createColumnHelper<SerialAppt>()

const columns = [
  col.accessor('name', {
    header: 'Nombre',
    cell: info => <span className="font-medium text-ink">{info.getValue()}</span>,
  }),
  col.accessor('appointmentType', {
    header: 'Tipo',
    enableSorting: false,
    cell: info => <TypeChip type={info.getValue() ?? 'showroom'} />,
  }),
  col.accessor('productType', {
    header: 'Producto',
    enableSorting: false,
    cell: info => (
      <span className="whitespace-nowrap text-xs text-ink-muted">
        {info.getValue() || '—'}
      </span>
    ),
  }),
  col.accessor('commercialPriority', {
    header: 'Prioridad',
    enableSorting: false,
    cell: info => <PriorityBadge value={info.getValue() ?? 'normal'} />,
  }),
  col.accessor('slotDatetime', {
    header: 'Fecha',
    cell: info => <span className="whitespace-nowrap text-ink-muted">{formatShortDate(info.getValue())}</span>,
  }),
  col.accessor('email', {
    header: 'Email',
    enableSorting: false,
    cell: info => <span className="text-xs text-ink-muted">{info.getValue()}</span>,
  }),
  col.accessor('status', {
    header: 'Estado',
    enableSorting: false,
    cell: info => <StatusIndicators appt={info.row.original} />,
  }),
]

/** Día calendario CDMX (yyyy-MM-dd), con desplazamiento opcional en días. */
function cdmxDay(offsetDays = 0): string {
  return formatInTimeZone(new Date(Date.now() + offsetDays * 86_400_000), BUSINESS_TZ, 'yyyy-MM-dd')
}

/**
 * Refleja la cita abierta en la URL (?open=<id>) sin recargar, para poder
 * compartir el enlace directo al detalle. Conserva el state de Next.
 */
function syncOpenParam(id: string | null) {
  const url = new URL(window.location.href)
  if (id) url.searchParams.set('open', id)
  else url.searchParams.delete('open')
  window.history.replaceState(window.history.state, '', url)
}

function SortIcon({ sorted }: { sorted: false | 'asc' | 'desc' }) {
  if (sorted === 'asc')  return <ChevronUp size={13} className="text-champagne-solid" aria-hidden="true" />
  if (sorted === 'desc') return <ChevronDown size={13} className="text-champagne-solid" aria-hidden="true" />
  return <ChevronsUpDown size={13} className="text-ink-subtle opacity-50" aria-hidden="true" />
}

export function AppointmentTable() {
  const searchParams = useSearchParams()
  const deepLinkHandled = useRef(false)
  const [appointments, setAppointments] = useState<SerialAppt[]>([])
  const [loading,     setLoading]       = useState(true)
  const [error,       setError]         = useState(false)
  const [nextCursor,  setNextCursor]    = useState<string | null>(null)
  const [search,      setSearch]        = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [dateFrom,    setDateFrom]      = useState('')
  const [dateTo,      setDateTo]        = useState('')
  const [statusFilter,setStatusFilter]  = useState<AppointmentStatus | ''>('')
  const [appointmentTypeFilter, setAppointmentTypeFilter] = useState<AppointmentType | ''>('')
  const [productFilter, setProductFilter] = useState('')
  const [budgetFilter, setBudgetFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<CommercialPriority | ''>('')
  const [commercialFilter, setCommercialFilter] = useState<CommercialStatus | ''>('')
  const [unconfirmedOnly, setUnconfirmedOnly] = useState(false)
  const [noShowOnly, setNoShowOnly] = useState(false)
  const [followUpDueOnly, setFollowUpDueOnly] = useState(false)
  const [showFilters, setShowFilters]   = useState(false)
  const [sorting,     setSorting]       = useState<SortingState>([])
  const [openId,      setOpenId]        = useState<string | null>(null)
  const [openInitial, setOpenInitial]   = useState<SerialAppt | null>(null)
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set())
  const [batchActing, setBatchActing]   = useState(false)

  // Debounce the search box so we don't fire one request per keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(t)
  }, [search])

  const fetchAppointments = useCallback(async (reset = true) => {
    if (reset) { setLoading(true); setError(false) }
    const params = new URLSearchParams()
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (statusFilter) params.set('status', statusFilter)
    if (appointmentTypeFilter) params.set('appointmentType', appointmentTypeFilter)
    if (productFilter) params.set('productType', productFilter)
    if (budgetFilter) params.set('budgetRange', budgetFilter)
    if (priorityFilter) params.set('priority', priorityFilter)
    if (commercialFilter) params.set('commercialStatus', commercialFilter)
    if (unconfirmedOnly) params.set('clientConfirmed', 'false')
    if (noShowOnly) params.set('attended', 'false')
    if (followUpDueOnly) params.set('followUpDue', '1')
    // Date inputs are CDMX calendar days; the backend filters slotDatetime,
    // so 'hasta' is the start of the following day (exclusive upper bound).
    if (dateFrom) params.set('dateFrom', `${dateFrom}T00:00:00`)
    if (dateTo)   params.set('dateTo',   `${dateTo}T23:59:59`)
    if (!reset && nextCursor) params.set('cursor', nextCursor)

    try {
      const res  = await fetch(`/api/admin/appointments?${params}`)
      if (res.status === 401) {
        window.location.href = '/admin/login?from=/admin/citas'
        return
      }
      if (!res.ok) throw new Error()
      const data = await res.json() as { appointments: SerialAppt[]; nextCursor: string | null }
      setAppointments(reset ? data.appointments : prev => [...prev, ...data.appointments])
      setNextCursor(data.nextCursor)
    } catch {
      if (reset) setError(true)
      toast.error('Error al cargar citas')
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, statusFilter, appointmentTypeFilter, productFilter, budgetFilter, priorityFilter, commercialFilter, unconfirmedOnly, noShowOnly, followUpDueOnly, dateFrom, dateTo, nextCursor])

  useEffect(() => { fetchAppointments(true); setSelectedIds(new Set()) }, [debouncedSearch, statusFilter, appointmentTypeFilter, productFilter, budgetFilter, priorityFilter, commercialFilter, unconfirmedOnly, noShowOnly, followUpDueOnly, dateFrom, dateTo]) // eslint-disable-line

  const pendingIds = appointments.filter(a => a.status === 'pending').map(a => a.id)
  const allPendingSelected = pendingIds.length > 0 && pendingIds.every(id => selectedIds.has(id))

  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const toggleSelectAllPending = () => setSelectedIds(prev =>
    allPendingSelected ? new Set() : new Set(pendingIds))

  const batchDecide = useCallback(async (action: 'accept' | 'reject') => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    setBatchActing(true)
    try {
      const res = await fetch('/api/admin/appointments/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action }),
      })
      if (res.status === 401) { window.location.href = '/admin/login?from=/admin/citas'; return }
      const data = await res.json() as { succeeded?: number; failed?: { id: string; error: string }[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error')
      const failedIds = new Set((data.failed ?? []).map(f => f.id))
      const newStatus: AppointmentStatus = action === 'accept' ? 'accepted' : 'rejected'
      setAppointments(prev => prev.map(a =>
        ids.includes(a.id) && !failedIds.has(a.id) ? { ...a, status: newStatus, clientConfirmed: false } : a))
      setSelectedIds(new Set())
      const ok = data.succeeded ?? 0
      const failN = data.failed?.length ?? 0
      toast.success(failN > 0
        ? `${ok} ${action === 'accept' ? 'confirmadas' : 'rechazadas'}, ${failN} con error`
        : `${ok} ${action === 'accept' ? 'confirmadas' : 'rechazadas'}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al procesar el lote')
    } finally {
      setBatchActing(false)
    }
  }, [selectedIds])

  // El modal compartido (AppointmentDetail) carga el detalle completo por su
  // cuenta; aquí solo se pasa la fila como pintura inicial instantánea.
  const openAppointment = useCallback((appt: SerialAppt) => {
    setOpenInitial(appt)
    setOpenId(appt.id)
    syncOpenParam(appt.id)
  }, [])

  const closeAppointment = useCallback(() => {
    setOpenId(null)
    setOpenInitial(null)
    syncOpenParam(null)
  }, [])

  // Parche optimista tras acciones del modal: conserva filtros, orden y scroll
  // en lugar de recargar toda la tabla.
  const handleUpdated = useCallback((id: string, patch: Partial<SerialAppt>) => {
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a))
  }, [])

  // Deep-link: ?open=<id> abre el detalle de esa cita al montar la tabla.
  // Solo se tiene el id; el modal compartido carga el detalle completo.
  useEffect(() => {
    if (deepLinkHandled.current) return
    deepLinkHandled.current = true
    const linkedId = searchParams.get('open')
    if (!linkedId) return
    setOpenInitial(null)
    setOpenId(linkedId)
  }, [searchParams])

  const exportCSV = useCallback(() => {
    const BOM  = '﻿'
    const head = csvRow(['Código', 'Tipo', 'Nombre', 'Email', 'Teléfono', 'Fecha', 'Estado', 'Prioridad', 'Seguimiento', 'Producto', 'Presupuesto', 'Busca', 'Brief anillo', 'Meeting link', 'Notas cliente', 'Nota interna', 'Follow-up', 'Aprobado por'])
    const rows = appointments.map(a => csvRow([
      a.confirmationCode,
      appointmentTypeLabels[a.appointmentType ?? 'showroom'],
      a.name,
      a.email,
      a.phone,
      new Date(a.slotDatetime).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }),
      a.status,
      a.commercialPriority ?? '',
      a.commercialStatus ? commercialStatusLabels[a.commercialStatus] : '',
      a.productType ?? '',
      a.budgetRange ?? '',
      a.lookingFor ?? '',
      engagementBriefRows(a.engagementBrief).map(([label, value]) => `${label}: ${value}`).join(' | '),
      a.meetingUrl ?? '',
      a.notes ?? '',
      a.internalNote ?? '',
      a.followUpAt ? new Date(a.followUpAt).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }) : '',
      a.decidedBy ?? '',
    ]))
    const csv  = BOM + [head, ...rows].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `citas-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [appointments])

  const table = useReactTable({
    data: appointments,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  // Chips de filtros rápidos: solo setean el estado de los filtros existentes.
  // Volver a tocar un chip activo lo des-selecciona (quita ese filtro).
  const today    = cdmxDay(0)
  const tomorrow = cdmxDay(1)
  const weekEnd  = cdmxDay(6)
  const dateChip = (label: string, from: string, to: string) => {
    const active = dateFrom === from && dateTo === to
    return {
      key: label,
      label,
      active,
      toggle: () => { setDateFrom(active ? '' : from); setDateTo(active ? '' : to) },
    }
  }
  const quickChips = [
    dateChip('Hoy', today, today),
    dateChip('Mañana', tomorrow, tomorrow),
    dateChip('7 días', today, weekEnd),
    {
      key: 'pendientes',
      label: 'Pendientes',
      active: statusFilter === 'pending',
      toggle: () => setStatusFilter(prev => prev === 'pending' ? '' : 'pending'),
    },
    {
      key: 'sin-confirmar',
      label: 'Sin confirmar',
      active: unconfirmedOnly,
      toggle: () => setUnconfirmedOnly(v => !v),
    },
    {
      key: 'no-shows',
      label: 'No-shows',
      active: noShowOnly,
      toggle: () => setNoShowOnly(v => !v),
    },
    {
      key: 'follow-ups',
      label: 'Follow-ups',
      active: followUpDueOnly,
      toggle: () => setFollowUpDueOnly(v => !v),
    },
  ]

  const hasActiveFilters = Boolean(search || statusFilter || appointmentTypeFilter || productFilter || budgetFilter || priorityFilter || commercialFilter || dateFrom || dateTo || unconfirmedOnly || noShowOnly || followUpDueOnly)
  // Filtros dentro del panel avanzado (colapsable en móvil) que están activos.
  const advancedFilterCount = [statusFilter, appointmentTypeFilter, productFilter, budgetFilter, priorityFilter, commercialFilter, dateFrom, dateTo].filter(Boolean).length

  const rows = table.getRowModel().rows

  return (
    <div className="space-y-4">
      {/* Quick filter chips — un tap, scrolleable en móvil */}
      <div
        role="group"
        aria-label="Filtros rápidos"
        className="-mb-1 flex gap-2 overflow-x-auto pb-1"
      >
        {quickChips.map(chip => (
          <button
            key={chip.key}
            type="button"
            onClick={chip.toggle}
            aria-pressed={chip.active}
            className={cn(
              'flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:shadow-focus-ring',
              chip.active
                ? 'border-champagne-solid bg-champagne-solid text-white'
                : 'border-ink-line bg-admin-panel text-ink-muted hover:border-champagne hover:bg-champagne-tint hover:text-ink',
            )}
          >
            {chip.active && <CheckCircle size={13} strokeWidth={2} aria-hidden="true" />}
            {chip.label}
          </button>
        ))}
      </div>

      {/* Toggle de filtros avanzados — solo móvil */}
      <button
        type="button"
        onClick={() => setShowFilters(v => !v)}
        aria-expanded={showFilters}
        aria-controls="advanced-filters"
        className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-2xl border border-admin-line bg-admin-panel px-4 text-sm font-medium text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:shadow-focus-ring sm:hidden"
      >
        <span className="flex items-center gap-2">
          <SlidersHorizontal size={15} strokeWidth={1.5} />
          Filtros y exportar
          {advancedFilterCount > 0 && (
            <span className="rounded-full bg-champagne-solid px-1.5 py-0.5 text-[10px] font-semibold text-white">{advancedFilterCount}</span>
          )}
        </span>
        <ChevronDown size={16} strokeWidth={1.5} className={cn('transition-transform duration-200 ease-quart', showFilters && 'rotate-180')} />
      </button>

      {/* Filtros avanzados: selects + rango de fechas (colapsables en móvil) */}
      <div id="advanced-filters" className={cn('space-y-2', !showFilters && 'hidden sm:block')}>
        {/* Filters */}
        <div className="grid grid-cols-1 gap-2 rounded-2xl border border-admin-line bg-admin-panel p-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_150px_165px_170px_190px_130px_150px_auto]">
          <div className="relative sm:col-span-2 xl:col-span-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Buscar citas"
              placeholder="Buscar nombre, email o código…"
              className="input-clean pl-9"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as AppointmentStatus | '')}
            aria-label="Filtrar por estado"
            className="input-clean"
          >
            <option value="">Todos los estados</option>
            <option value="pending">Pendientes</option>
            <option value="accepted">Confirmadas</option>
            <option value="rejected">Rechazadas</option>
            <option value="cancelled">Canceladas</option>
          </select>
          <select
            value={appointmentTypeFilter}
            onChange={e => setAppointmentTypeFilter(e.target.value as AppointmentType | '')}
            aria-label="Filtrar por tipo de cita"
            className="input-clean"
          >
            <option value="">Todo tipo</option>
            {appointmentTypeOptions.map(option => (
              <option key={option} value={option}>{appointmentTypeLabels[option]}</option>
            ))}
          </select>
          <select
            value={productFilter}
            onChange={e => setProductFilter(e.target.value)}
            aria-label="Filtrar por producto"
            className="input-clean"
          >
            <option value="">Todo producto</option>
            {productTypeOptions.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
          <select
            value={budgetFilter}
            onChange={e => setBudgetFilter(e.target.value)}
            aria-label="Filtrar por presupuesto"
            className="input-clean"
          >
            <option value="">Todo presupuesto</option>
            {budgetRangeOptions.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
          <select
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value as CommercialPriority | '')}
            aria-label="Filtrar por prioridad"
            className="input-clean"
          >
            <option value="">Prioridad</option>
            <option value="high">Alta</option>
            <option value="medium">Media</option>
            <option value="normal">Normal</option>
          </select>
          <select
            value={commercialFilter}
            onChange={e => setCommercialFilter(e.target.value as CommercialStatus | '')}
            aria-label="Filtrar por seguimiento comercial"
            className="input-clean"
          >
            <option value="">Seguimiento</option>
            {commercialStatusOptions.map(option => (
              <option key={option} value={option}>{commercialStatusLabels[option]}</option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={exportCSV} className="min-h-[44px] shrink-0">
            <Download size={14} strokeWidth={1.5} /> CSV
          </Button>
        </div>

        {/* Date range filter */}
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-admin-line bg-admin-panel px-3 py-2.5">
          <div>
            <label htmlFor="filter-date-from" className="label-clean">Desde</label>
            <input
              id="filter-date-from"
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={e => setDateFrom(e.target.value)}
              className="input-clean mt-1 h-9 min-h-0 py-1.5 text-sm"
            />
          </div>
          <div>
            <label htmlFor="filter-date-to" className="label-clean">Hasta</label>
            <input
              id="filter-date-to"
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={e => setDateTo(e.target.value)}
              className="input-clean mt-1 h-9 min-h-0 py-1.5 text-sm"
            />
          </div>
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo('') }}
              className="h-9 rounded-lg px-3 text-xs font-medium text-ink-muted transition-colors hover:bg-admin-surface hover:text-ink"
            >
              Limpiar fechas
            </button>
          )}
        </div>
      </div>

      {/* Batch action bar — appears when pending appointments are selected */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-champagne-soft bg-champagne-tint/60 px-4 py-2.5">
          <p className="text-sm font-medium text-ink">
            {selectedIds.size} {selectedIds.size === 1 ? 'cita seleccionada' : 'citas seleccionadas'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSelectedIds(new Set())}
              className="min-h-[44px] rounded-lg px-3 text-xs font-medium text-ink-muted transition-colors hover:bg-admin-panel hover:text-ink focus-visible:outline-none focus-visible:shadow-focus-ring"
            >
              Limpiar
            </button>
            <Button variant="gold" size="sm" className="min-h-[44px]" loading={batchActing} onClick={() => batchDecide('accept')}>
              <CheckCircle size={14} strokeWidth={1.5} /> Confirmar {selectedIds.size}
            </Button>
            <Button variant="danger" size="sm" className="min-h-[44px]" loading={batchActing} onClick={() => batchDecide('reject')}>
              <XCircle size={14} strokeWidth={1.5} /> Rechazar {selectedIds.size}
            </Button>
          </div>
        </div>
      )}

      {/* Content: error → carga → vacío → datos (tarjetas en móvil, tabla en escritorio) */}
      {error ? (
        <div className="rounded-2xl border border-admin-line bg-admin-panel">
          <EmptyState
            icon={<AlertTriangle size={28} strokeWidth={1.5} />}
            title="No se pudieron cargar las citas"
            description="Revisa tu conexión e inténtalo de nuevo."
            action={{ label: 'Reintentar', onClick: () => void fetchAppointments(true) }}
          />
        </div>
      ) : loading ? (
        <>
          <div className="hidden overflow-hidden rounded-2xl border border-admin-line bg-admin-panel sm:block">
            <TableSkeleton rows={6} cols={9} />
          </div>
          <ul className="space-y-2.5 sm:hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i}><Skeleton className="h-32 w-full" /></li>
            ))}
          </ul>
        </>
      ) : appointments.length === 0 ? (
        <div className="rounded-2xl border border-admin-line bg-admin-panel">
          <EmptyState
            title="Sin citas"
            description={hasActiveFilters ? 'Ninguna cita coincide con los filtros.' : 'No hay citas registradas aún.'}
          />
        </div>
      ) : (
        <>
          {/* Mobile: lista de tarjetas legibles (sin scroll horizontal) */}
          <div className="sm:hidden">
            {pendingIds.length > 0 && (
              <button
                type="button"
                onClick={toggleSelectAllPending}
                aria-pressed={allPendingSelected}
                className="mb-2.5 flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border border-admin-line bg-admin-panel px-3 text-xs font-medium text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:shadow-focus-ring"
              >
                {allPendingSelected ? 'Quitar selección' : `Seleccionar ${pendingIds.length} pendientes`}
              </button>
            )}
            <ul className="space-y-2.5">
              {rows.map(row => {
                const appt = row.original
                const pending = appt.status === 'pending'
                const selected = selectedIds.has(appt.id)
                return (
                  <li key={row.id}>
                    <div className={cn(
                      'rounded-2xl border bg-admin-panel p-3.5 transition-colors',
                      selected ? 'border-champagne bg-champagne-tint/40' : 'border-admin-line',
                    )}>
                      <div className="flex items-start gap-3">
                        {pending && (
                          <input
                            type="checkbox"
                            aria-label={`Seleccionar cita de ${appt.name}`}
                            checked={selected}
                            onChange={() => toggleSelect(appt.id)}
                            className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-champagne-solid"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => openAppointment(appt)}
                          aria-label={`${pending ? 'Gestionar' : 'Ver'} cita de ${appt.name}`}
                          className="min-w-0 flex-1 rounded-lg text-left focus-visible:outline-none focus-visible:shadow-focus-ring"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate font-medium text-ink">{appt.name}</p>
                            <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-ink-muted">
                              {formatShortDate(appt.slotDatetime)}
                              <ChevronRight size={14} strokeWidth={1.5} className="text-ink-subtle" aria-hidden="true" />
                            </span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <TypeChip type={appt.appointmentType ?? 'showroom'} />
                            <PriorityBadge value={appt.commercialPriority ?? 'normal'} />
                            {appt.productType && <span className="text-xs text-ink-muted">{appt.productType}</span>}
                          </div>
                          <div className="mt-2.5">
                            <StatusIndicators appt={appt} />
                          </div>
                        </button>
                      </div>
                      {(appt.identificationUrl || appt.phone) && (
                        <div className="mt-3 flex items-center gap-2 border-t border-admin-line pt-2.5">
                          {appt.identificationUrl && (
                            <a
                              href={`/api/admin/id-url?path=${encodeURIComponent(appt.identificationUrl)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-ink-muted transition-colors hover:bg-champagne-tint hover:text-champagne-solid focus-visible:outline-none focus-visible:shadow-focus-ring"
                              aria-label={`Ver identificación de ${appt.name}`}
                            >
                              <FileText size={14} strokeWidth={1.5} /> Identificación
                            </a>
                          )}
                          {appt.phone && (
                            <a
                              href={formatWhatsAppUrl(appt.phone, appt.name)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:shadow-focus-ring"
                              aria-label={`Escribir por WhatsApp a ${appt.name}`}
                            >
                              <MessageCircle size={14} strokeWidth={1.5} /> WhatsApp
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>

          {/* Desktop: tabla densa */}
          <div className="hidden overflow-x-auto rounded-2xl border border-admin-line bg-admin-panel sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-admin-line bg-admin-surface/70">
                  <th scope="col" className="w-10 px-3 py-3 text-left">
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todas las pendientes"
                      checked={allPendingSelected}
                      disabled={pendingIds.length === 0}
                      onChange={toggleSelectAllPending}
                      className="h-4 w-4 cursor-pointer accent-champagne-solid disabled:opacity-30"
                    />
                  </th>
                  {table.getFlatHeaders().map(header => {
                    const sorted = header.column.getIsSorted()
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        aria-sort={header.column.getCanSort() ? (sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none') : undefined}
                        className={cn(
                          'px-4 py-3 text-left',
                          (header.id === 'email' || header.id === 'productType' || header.id === 'commercialPriority') && 'hidden lg:table-cell',
                        )}
                      >
                        {header.column.getCanSort() ? (
                          <button
                            onClick={header.column.getToggleSortingHandler()}
                            className="group inline-flex h-eyebrow items-center gap-1.5 text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:shadow-focus-ring"
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            <SortIcon sorted={sorted} />
                          </button>
                        ) : (
                          <span className="h-eyebrow text-ink-muted">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </span>
                        )}
                      </th>
                    )
                  })}
                  <th scope="col" className="h-eyebrow px-4 py-3 text-left text-ink-muted">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const appt = row.original
                  return (
                    <tr
                      key={row.id}
                      tabIndex={0}
                      onKeyDown={e => {
                        // Enter/Space on a focused row opens it, unless focus is on
                        // an inner control (the ID/WhatsApp links or Gestionar button).
                        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
                          e.preventDefault()
                          openAppointment(appt)
                        }
                      }}
                      className={cn(
                        'border-b border-admin-line transition-colors last:border-0 hover:bg-champagne-tint/60 focus-visible:bg-champagne-tint/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-champagne',
                        selectedIds.has(appt.id) && 'bg-champagne-tint/50',
                      )}
                    >
                      <td className="w-10 px-3 py-3">
                        {appt.status === 'pending' ? (
                          <input
                            type="checkbox"
                            aria-label={`Seleccionar cita de ${appt.name}`}
                            checked={selectedIds.has(appt.id)}
                            onChange={() => toggleSelect(appt.id)}
                            onKeyDown={e => e.stopPropagation()}
                            className="h-4 w-4 cursor-pointer accent-champagne-solid"
                          />
                        ) : null}
                      </td>
                      {row.getVisibleCells().map(cell => (
                        <td
                          key={cell.id}
                          className={cn(
                            'px-4 py-3',
                            (cell.column.id === 'email' || cell.column.id === 'productType' || cell.column.id === 'commercialPriority') && 'hidden lg:table-cell',
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {appt.identificationUrl && (
                            <a
                              href={`/api/admin/id-url?path=${encodeURIComponent(appt.identificationUrl)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-lg p-1.5 text-ink-subtle transition-colors hover:bg-champagne-tint hover:text-champagne-solid focus-visible:outline-none focus-visible:shadow-focus-ring"
                              aria-label={`Ver identificación de ${appt.name}`}
                            >
                              <FileText size={14} strokeWidth={1.5} />
                            </a>
                          )}
                          {appt.phone && (
                            <a
                              href={formatWhatsAppUrl(appt.phone, appt.name)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-lg p-1.5 text-ink-subtle transition-colors hover:bg-emerald-50 hover:text-emerald-600 focus-visible:outline-none focus-visible:shadow-focus-ring"
                              aria-label={`Escribir por WhatsApp a ${appt.name}`}
                            >
                              <MessageCircle size={14} strokeWidth={1.5} />
                            </a>
                          )}
                          <button
                            onClick={() => openAppointment(appt)}
                            className={cn(
                              'rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:shadow-focus-ring',
                              appt.status === 'pending'
                                ? 'bg-champagne-tint text-champagne-deep hover:bg-champagne-soft'
                                : 'text-ink-muted hover:bg-admin-surface hover:text-ink',
                            )}
                            aria-label={`${appt.status === 'pending' ? 'Gestionar' : 'Ver'} cita de ${appt.name}`}
                          >
                            {appt.status === 'pending' ? 'Gestionar' : 'Ver'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Load more */}
      {nextCursor && !loading && !error && (
        <div className="text-center">
          <Button variant="outline" size="sm" className="min-h-[44px]" onClick={() => fetchAppointments(false)}>
            <ChevronDown size={14} strokeWidth={1.5} /> Cargar más
          </Button>
        </div>
      )}

      {/* Detail modal — componente compartido con el calendario */}
      <AppointmentDetail
        appointmentId={openId}
        initialData={openInitial}
        onClose={closeAppointment}
        onUpdated={handleUpdated}
      />
    </div>
  )
}
