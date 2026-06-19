'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  createColumnHelper,
  flexRender,
  type SortingState,
} from '@tanstack/react-table'
import { toast } from 'sonner'
import { CheckCircle, XCircle, Download, ChevronDown, ChevronUp, ChevronsUpDown, Search, Users, ExternalLink, FileText, MailCheck, MailQuestion, MessageCircle, Save } from 'lucide-react'
import { StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Textarea } from '@/components/ui/Input'
import { GuestsList } from './GuestsList'
import { formatShortDate, csvRow, cn } from '@/lib/utils'
import { appointmentTypeLabels, commercialStatusLabels, engagementBriefRows, formatWhatsAppUrl } from '@/lib/commercial'
import { appointmentTypeOptions, budgetRangeOptions, commercialStatusOptions, productTypeOptions } from '@/lib/schemas'
import type { Appointment, AppointmentStatus, AppointmentType, CommercialPriority, CommercialStatus } from '@/types'

type CustomerHistoryItem = {
  id: string
  name: string
  status: AppointmentStatus
  appointmentType?: AppointmentType
  slotDatetime: string | null
  productType?: string
  budgetRange?: string
  commercialStatus?: CommercialStatus
}

type AppointmentEventItem = {
  id: string
  action: string
  actor: string
  summary: string
  createdAt: string | null
}

type SerialAppt = Omit<Appointment, 'slotDatetime' | 'createdAt' | 'updatedAt' | 'decidedAt' | 'clientConfirmedAt' | 'followUpAt'> & {
  slotDatetime: string
  createdAt: string
  updatedAt?: string
  decidedAt?: string | null
  clientConfirmedAt?: string | null
  followUpAt?: string | null
  commercialPriority?: CommercialPriority
  customerHistory?: CustomerHistoryItem[]
  eventHistory?: AppointmentEventItem[]
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
    cell: info => (
      <span className="whitespace-nowrap rounded-full border border-admin-line bg-admin-surface px-2 py-0.5 text-[10px] font-semibold text-ink-muted">
        {appointmentTypeLabels[info.getValue() ?? 'showroom']}
      </span>
    ),
  }),
  col.accessor('productType', {
    header: 'Producto',
    enableSorting: false,
    cell: info => (
      <span className="text-xs text-ink-muted whitespace-nowrap">
        {info.getValue() || '—'}
      </span>
    ),
  }),
  col.accessor('commercialPriority', {
    header: 'Prioridad',
    enableSorting: false,
    cell: info => {
      const value = info.getValue() ?? 'normal'
      const label = value === 'high' ? 'Alta' : value === 'medium' ? 'Media' : 'Normal'
      return (
        <span className={cn(
          'inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
          value === 'high' && 'border-red-200 bg-red-50 text-red-600',
          value === 'medium' && 'border-amber-200 bg-amber-50 text-amber-700',
          value === 'normal' && 'border-admin-line bg-admin-surface text-ink-muted',
        )}>
          {label}
        </span>
      )
    },
  }),
  col.accessor('slotDatetime', {
    header: 'Fecha',
    cell: info => <span className="text-ink-muted whitespace-nowrap">{formatShortDate(info.getValue())}</span>,
  }),
  col.accessor('email', {
    header: 'Email',
    enableSorting: false,
    cell: info => <span className="text-ink-muted text-xs">{info.getValue()}</span>,
  }),
  col.accessor('status', {
    header: 'Estado',
    enableSorting: false,
    cell: info => {
      const row = info.row.original
      const showConfirm = info.getValue() === 'accepted'
      return (
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusBadge status={info.getValue()} />
          {showConfirm && row.clientConfirmed && (
            <span
              title="El cliente confirmó su asistencia"
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"
            >
              <MailCheck size={9} strokeWidth={1.5} />
              Confirmó
            </span>
          )}
          {showConfirm && !row.clientConfirmed && (
            <span
              title="El cliente aún no confirma su asistencia"
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200"
            >
              <MailQuestion size={9} strokeWidth={1.5} />
              Sin confirmar
            </span>
          )}
          {(row.guestCount ?? 0) > 0 && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-champagne-tint text-champagne-deep border border-champagne-soft">
              <Users size={9} strokeWidth={1.5} />
              {row.guestCount}
            </span>
          )}
          {row.attended === true && (
            <span title="El cliente asistió" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              Asistió
            </span>
          )}
          {row.attended === false && (
            <span title="El cliente no se presentó" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-600 border border-red-200">
              No asistió
            </span>
          )}
        </div>
      )
    },
  }),
]

function SortIcon({ sorted }: { sorted: false | 'asc' | 'desc' }) {
  if (sorted === 'asc')  return <ChevronUp size={13} className="text-champagne-solid" aria-label="Orden ascendente" />
  if (sorted === 'desc') return <ChevronDown size={13} className="text-champagne-solid" aria-label="Orden descendente" />
  return <ChevronsUpDown size={13} className="text-ink-subtle opacity-50" aria-label="Sin ordenar" />
}

export function AppointmentTable() {
  const [appointments, setAppointments] = useState<SerialAppt[]>([])
  const [loading,     setLoading]       = useState(true)
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
  const [sorting,     setSorting]       = useState<SortingState>([])
  const [selected,    setSelected]      = useState<SerialAppt | null>(null)
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set())
  const [batchActing, setBatchActing]   = useState(false)
  const [deciding,    setDeciding]      = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [savingCommercial, setSavingCommercial] = useState(false)
  const [rejectReason,setRejectReason]  = useState('')
  const [commercialStatus, setCommercialStatus] = useState<CommercialStatus>('pending')
  const [internalNote, setInternalNote] = useState('')
  const [followUpAt, setFollowUpAt] = useState('')
  const [meetingUrl, setMeetingUrl] = useState('')
  const [meetingProvider, setMeetingProvider] = useState('')
  const [meetingInstructions, setMeetingInstructions] = useState('')

  // Debounce the search box so we don't fire one request per keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(t)
  }, [search])

  const fetchAppointments = useCallback(async (reset = true) => {
    if (reset) setLoading(true)
    const params = new URLSearchParams()
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (statusFilter) params.set('status', statusFilter)
    if (appointmentTypeFilter) params.set('appointmentType', appointmentTypeFilter)
    if (productFilter) params.set('productType', productFilter)
    if (budgetFilter) params.set('budgetRange', budgetFilter)
    if (priorityFilter) params.set('priority', priorityFilter)
    if (commercialFilter) params.set('commercialStatus', commercialFilter)
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
      toast.error('Error al cargar citas')
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, statusFilter, appointmentTypeFilter, productFilter, budgetFilter, priorityFilter, commercialFilter, dateFrom, dateTo, nextCursor])

  useEffect(() => { fetchAppointments(true); setSelectedIds(new Set()) }, [debouncedSearch, statusFilter, appointmentTypeFilter, productFilter, budgetFilter, priorityFilter, commercialFilter, dateFrom, dateTo]) // eslint-disable-line

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

  useEffect(() => {
    if (!selected) return
    setRejectReason('')   // never carry a rejection reason from a previous appointment
    setCommercialStatus(selected.commercialStatus ?? 'pending')
    setInternalNote(selected.internalNote ?? '')
    setFollowUpAt(selected.followUpAt ? selected.followUpAt.slice(0, 16) : '')
    setMeetingUrl(selected.meetingUrl ?? '')
    setMeetingProvider(selected.meetingProvider ?? '')
    setMeetingInstructions(selected.meetingInstructions ?? '')
  }, [selected])

  const openAppointment = useCallback(async (appt: SerialAppt) => {
    setSelected(appt)
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/admin/appointments/${appt.id}`)
      if (res.status === 401) {
        window.location.href = '/admin/login?from=/admin/citas'
        return
      }
      if (!res.ok) throw new Error()
      const detail = await res.json() as SerialAppt
      setSelected(prev => prev && prev.id === appt.id ? { ...prev, ...detail } : prev)
    } catch {
      toast.error('No se pudo cargar el historial del cliente')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const markAttendance = useCallback(async (attended: boolean) => {
    if (!selected) return
    setDeciding(true)
    try {
      const res = await fetch(`/api/admin/appointments/${selected.id}/attend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attended }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? 'Error')
      }
      toast.success(attended ? 'Marcada como asistió' : 'Marcada como no asistió')
      setSelected(prev => prev ? { ...prev, attended } : prev)
      setAppointments(prev => prev.map(a => a.id === selected.id ? { ...a, attended } : a))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar asistencia')
    } finally {
      setDeciding(false)
    }
  }, [selected])

  const decide = useCallback(async (action: 'accept' | 'reject') => {
    if (!selected) return
    if (
      action === 'accept' &&
      selected.appointmentType === 'video_engagement_rings' &&
      !meetingUrl.trim()
    ) {
      const ok = window.confirm('Esta video consulta no tiene link guardado. Puedes aceptarla, pero el cliente recibirá que el enlace está pendiente. ¿Aceptar de todos modos?')
      if (!ok) return
    }
    setDeciding(true)
    try {
      const res = await fetch(`/api/admin/appointments/${selected.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          reason: rejectReason || undefined,
          meetingUrl,
          meetingProvider,
          meetingInstructions,
        }),
      })
      if (!res.ok) {
        const err = await res.json() as { error?: string }
        throw new Error(err.error ?? 'Error')
      }
      toast.success(action === 'accept' ? 'Cita confirmada' : 'Cita rechazada')
      // Optimistic in-place update: keep the operator's filters, sort and scroll
      // position instead of reloading the whole table.
      const newStatus: AppointmentStatus = action === 'accept' ? 'accepted' : 'rejected'
      setAppointments(prev => prev.map(a =>
        a.id === selected.id ? { ...a, status: newStatus, clientConfirmed: false } : a))
      setSelected(null)
      setRejectReason('')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al procesar')
    } finally {
      setDeciding(false)
    }
  }, [selected, rejectReason, meetingUrl, meetingProvider, meetingInstructions, fetchAppointments])

  const saveCommercial = useCallback(async () => {
    if (!selected) return
    setSavingCommercial(true)
    try {
      const followUpIso = followUpAt ? new Date(followUpAt).toISOString() : ''
      const res = await fetch(`/api/admin/appointments/${selected.id}/commercial`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commercialStatus,
          internalNote,
          followUpAt: followUpIso,
          meetingUrl,
          meetingProvider,
          meetingInstructions,
        }),
      })
      if (!res.ok) {
        const err = await res.json() as { error?: string }
        throw new Error(err.error ?? 'Error')
      }
      toast.success('Seguimiento actualizado')
      const patch = {
        commercialStatus,
        internalNote,
        followUpAt: followUpIso || null,
        meetingUrl,
        meetingProvider,
        meetingInstructions,
      }
      setSelected(prev => prev ? { ...prev, ...patch } : prev)
      // Optimistic in-place update — preserve filters and table position
      setAppointments(prev => prev.map(a => a.id === selected.id ? { ...a, ...patch } : a))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar seguimiento')
    } finally {
      setSavingCommercial(false)
    }
  }, [selected, commercialStatus, internalNote, followUpAt, meetingUrl, meetingProvider, meetingInstructions, fetchAppointments])

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

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="grid grid-cols-1 gap-2 rounded-2xl border border-admin-line bg-admin-panel p-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_150px_165px_170px_190px_130px_150px_auto]">
        <div className="relative sm:col-span-2 xl:col-span-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar nombre, email o código…"
            className="input-clean pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as AppointmentStatus | '')}
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
          className="input-clean"
        >
          <option value="">Todo producto</option>
          {productTypeOptions.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
        <select
          value={budgetFilter}
          onChange={e => setBudgetFilter(e.target.value)}
          className="input-clean"
        >
          <option value="">Todo presupuesto</option>
          {budgetRangeOptions.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
        <select
          value={priorityFilter}
          onChange={e => setPriorityFilter(e.target.value as CommercialPriority | '')}
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
          className="input-clean"
        >
          <option value="">Seguimiento</option>
          {commercialStatusOptions.map(option => (
            <option key={option} value={option}>{commercialStatusLabels[option]}</option>
          ))}
        </select>
        <Button variant="outline" size="sm" onClick={exportCSV} className="shrink-0">
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
            className="h-9 rounded-lg px-3 text-xs font-medium text-ink-muted hover:bg-admin-surface hover:text-ink transition-colors"
          >
            Limpiar fechas
          </button>
        )}
      </div>

      {/* Batch action bar — appears when pending appointments are selected */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-champagne-soft bg-champagne-tint/60 px-4 py-2.5">
          <p className="text-sm font-medium text-ink">
            {selectedIds.size} {selectedIds.size === 1 ? 'cita seleccionada' : 'citas seleccionadas'}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedIds(new Set())}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-ink-muted hover:bg-white hover:text-ink transition-colors"
            >
              Limpiar
            </button>
            <Button variant="gold" size="sm" loading={batchActing} onClick={() => batchDecide('accept')}>
              <CheckCircle size={14} strokeWidth={1.5} /> Confirmar {selectedIds.size}
            </Button>
            <Button variant="danger" size="sm" loading={batchActing} onClick={() => batchDecide('reject')}>
              <XCircle size={14} strokeWidth={1.5} /> Rechazar {selectedIds.size}
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-admin-line bg-admin-panel">
        {loading ? (
          <TableSkeleton rows={6} cols={9} />
        ) : appointments.length === 0 ? (
          <EmptyState
            title="Sin citas"
            description={search || statusFilter ? 'Ninguna cita coincide con los filtros.' : 'No hay citas registradas aún.'}
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-admin-line bg-admin-surface/70">
                <th className="w-10 px-3 py-3 text-left">
                  <input
                    type="checkbox"
                    aria-label="Seleccionar todas las pendientes"
                    checked={allPendingSelected}
                    disabled={pendingIds.length === 0}
                    onChange={toggleSelectAllPending}
                    className="h-4 w-4 cursor-pointer accent-champagne-solid disabled:opacity-30"
                  />
                </th>
                {table.getFlatHeaders().map(header => (
                  <th
                    key={header.id}
                    className={cn(
                      'px-4 py-3 text-left',
                      (header.id === 'email' || header.id === 'productType' || header.id === 'commercialPriority') && 'hidden sm:table-cell',
                    )}
                  >
                    {header.column.getCanSort() ? (
                      <button
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1.5 h-eyebrow text-ink-muted hover:text-ink transition-colors group"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <SortIcon sorted={header.column.getIsSorted()} />
                      </button>
                    ) : (
                      <span className="h-eyebrow text-ink-muted">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </span>
                    )}
                  </th>
                ))}
                <th className="px-4 py-3 text-left h-eyebrow text-ink-muted">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {table.getRowModel().rows.map(row => {
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
                        void openAppointment(appt)
                      }
                    }}
                    className={cn(
                      'border-b border-admin-line last:border-0 hover:bg-champagne-tint/60 focus-visible:outline-none focus-visible:bg-champagne-tint/60 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-champagne transition-colors',
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
                          (cell.column.id === 'email' || cell.column.id === 'productType' || cell.column.id === 'commercialPriority') && 'hidden sm:table-cell',
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
                            className="rounded-lg p-1.5 text-ink-subtle transition-colors hover:bg-champagne-tint hover:text-champagne-solid"
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
                            className="rounded-lg p-1.5 text-ink-subtle transition-colors hover:bg-emerald-50 hover:text-emerald-600"
                            aria-label={`Escribir por WhatsApp a ${appt.name}`}
                          >
                            <MessageCircle size={14} strokeWidth={1.5} />
                          </a>
                        )}
                        <button
                          onClick={() => void openAppointment(appt)}
                          className={cn(
                            'rounded-lg px-2.5 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:shadow-focus-ring',
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
        )}
      </div>

      {/* Load more */}
      {nextCursor && !loading && (
        <div className="text-center">
          <Button variant="outline" size="sm" onClick={() => fetchAppointments(false)}>
            <ChevronDown size={14} strokeWidth={1.5} /> Cargar más
          </Button>
        </div>
      )}

      {/* Detail modal */}
      <Modal
        open={!!selected}
        onClose={() => { setSelected(null); setRejectReason('') }}
        title="Detalle de cita"
        size="md"
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="h-eyebrow mb-1">Solicitud</p>
                <h3 className="font-serif text-2xl font-light text-ink">{selected.name}</h3>
                {detailLoading && <p className="mt-1 text-xs text-ink-muted">Cargando historial...</p>}
              </div>
              <div className="flex flex-col items-end gap-2">
                <StatusBadge status={selected.status} />
                <span className={cn(
                  'inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                  selected.commercialPriority === 'high' && 'border-red-200 bg-red-50 text-red-600',
                  selected.commercialPriority === 'medium' && 'border-amber-200 bg-amber-50 text-amber-700',
                  (!selected.commercialPriority || selected.commercialPriority === 'normal') && 'border-admin-line bg-admin-surface text-ink-muted',
                )}>
                  {selected.commercialPriority === 'high' ? 'Prioridad alta' : selected.commercialPriority === 'medium' ? 'Prioridad media' : 'Prioridad normal'}
                </span>
              </div>
            </div>

            <dl className="divide-y divide-admin-line rounded-2xl border border-admin-line bg-admin-surface/60 px-4 text-sm">
              {[
                ['Código',    selected.confirmationCode],
                ['Tipo',      appointmentTypeLabels[selected.appointmentType ?? 'showroom']],
                ['Nombre',    selected.name],
                ['Email',     selected.email],
                ['Teléfono',  selected.phone],
                ['Fecha',     formatShortDate(selected.slotDatetime)],
                ...(selected.productType ? [['Producto', selected.productType]] : []),
                ...(selected.budgetRange ? [['Presupuesto', selected.budgetRange]] : []),
                ...(selected.lookingFor ? [['Busca', selected.lookingFor]] : []),
                ...engagementBriefRows(selected.engagementBrief),
                ...(selected.meetingUrl ? [['Link videollamada', selected.meetingUrl]] : []),
                ...(selected.meetingInstructions ? [['Instrucciones video', selected.meetingInstructions]] : []),
                ['Seguimiento', selected.commercialStatus ? commercialStatusLabels[selected.commercialStatus] : 'Pendiente'],
                ...(selected.followUpAt ? [['Follow-up', formatShortDate(selected.followUpAt)]] : []),
                ['Calendar',  selected.googleCalendarEventId
                  ? 'Sincronizado'
                  : (selected as SerialAppt & { calendarSyncFailed?: boolean }).calendarSyncFailed
                    ? 'Error de sincronización'
                    : 'Pendiente'],
                ...(selected.decidedBy ? [['Aprobado por', selected.decidedBy]] : []),
                ...(selected.decidedAt ? [['Fecha decisión', formatShortDate(selected.decidedAt)]] : []),
                ...(selected.status === 'accepted'
                  ? [['Confirmación cliente', selected.clientConfirmed
                      ? (selected.clientConfirmedAt ? `Sí — ${formatShortDate(selected.clientConfirmedAt)}` : 'Sí')
                      : 'Pendiente']]
                  : []),
                ...(selected.adminNote ? [['Nota admin', selected.adminNote]] : []),
                ...(selected.notes ? [['Notas cliente', selected.notes]] : []),
                ...(selected.internalNote ? [['Notas internas', selected.internalNote]] : []),
              ].map(([label, value]) => (
                <div key={label as string} className="flex justify-between py-2.5 gap-4">
                  <dt className="text-ink-muted shrink-0">{label}</dt>
                  <dd className="text-ink text-right">{value as string}</dd>
                </div>
              ))}
              <div className="flex justify-between py-2.5 gap-4">
                <dt className="text-ink-muted">Estado</dt>
                <dd><StatusBadge status={selected.status} /></dd>
              </div>
            </dl>

            <div className="rounded-2xl border border-admin-line bg-admin-surface/60 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="h-eyebrow mb-1">Seguimiento comercial</p>
                  <p className="text-xs text-ink-muted">Uso interno del equipo. No se muestra al cliente.</p>
                </div>
                {selected.phone && (
                  <a
                    href={formatWhatsAppUrl(selected.phone, selected.name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Escribir a ${selected.name} por WhatsApp`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                  >
                    <MessageCircle size={13} strokeWidth={1.5} />
                    WhatsApp
                  </a>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label-clean">Estado</label>
                  <select
                    value={commercialStatus}
                    onChange={e => setCommercialStatus(e.target.value as CommercialStatus)}
                    className="input-clean mt-1"
                  >
                    {commercialStatusOptions.map(option => (
                      <option key={option} value={option}>{commercialStatusLabels[option]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label-clean">Fecha de follow-up</label>
                  <input
                    type="datetime-local"
                    value={followUpAt}
                    onChange={e => setFollowUpAt(e.target.value)}
                    className="input-clean mt-1"
                  />
                </div>
              </div>
              <div className="mt-3">
                <label className="label-clean">Notas internas</label>
                <Textarea
                  value={internalNote}
                  onChange={e => setInternalNote(e.target.value)}
                  placeholder="Preparación, resultado, siguiente paso o contexto comercial."
                  rows={3}
                  className="mt-1"
                />
              </div>
              {selected.appointmentType === 'video_engagement_rings' && (
                <div className="mt-3 rounded-xl border border-champagne-soft bg-champagne-tint/50 p-3">
                  <p className="h-eyebrow mb-3">Videollamada</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label-clean">Proveedor</label>
                      <input
                        value={meetingProvider}
                        onChange={e => setMeetingProvider(e.target.value)}
                        placeholder="Google Meet, Zoom..."
                        className="input-clean mt-1"
                      />
                    </div>
                    <div>
                      <label className="label-clean">Link</label>
                      <input
                        value={meetingUrl}
                        onChange={e => setMeetingUrl(e.target.value)}
                        placeholder="https://meet.google.com/..."
                        className="input-clean mt-1"
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="label-clean">Instrucciones</label>
                    <Textarea
                      value={meetingInstructions}
                      onChange={e => setMeetingInstructions(e.target.value)}
                      placeholder="Ej: entra 5 minutos antes y ten referencias a la mano."
                      rows={2}
                      className="mt-1"
                    />
                  </div>
                  {!meetingUrl && selected.status === 'accepted' && (
                    <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      Esta video cita ya está aceptada pero todavía no tiene link.
                    </p>
                  )}
                </div>
              )}
              <Button size="sm" className="mt-3" loading={savingCommercial} onClick={() => void saveCommercial()}>
                <Save size={14} strokeWidth={1.5} />
                Guardar seguimiento
              </Button>
            </div>

            {/* Attendance — only for confirmed appointments */}
            {selected.status === 'accepted' && (
              <div className="rounded-2xl border border-admin-line bg-admin-surface/60 p-4">
                <div className="mb-3">
                  <p className="h-eyebrow mb-1">Asistencia</p>
                  <p className="text-xs text-ink-muted">
                    {selected.attended === true ? 'Registrada como asistió.'
                      : selected.attended === false ? 'Registrada como no se presentó.'
                      : 'Marca si el cliente acudió a su cita. Los no-shows se excluyen de la conversión.'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={selected.attended === true ? 'gold' : 'outline'}
                    size="sm" className="flex-1" loading={deciding}
                    onClick={() => void markAttendance(true)}
                  >
                    <CheckCircle size={14} strokeWidth={1.5} /> Asistió
                  </Button>
                  <Button
                    variant={selected.attended === false ? 'danger' : 'ghost'}
                    size="sm" className="flex-1" loading={deciding}
                    onClick={() => void markAttendance(false)}
                  >
                    <XCircle size={14} strokeWidth={1.5} /> No asistió
                  </Button>
                </div>
              </div>
            )}

            {selected.customerHistory && selected.customerHistory.length > 0 && (
              <div className="rounded-2xl border border-admin-line bg-admin-surface/60 p-4">
                <p className="h-eyebrow mb-3">Historial cliente</p>
                <div className="space-y-2">
                  {selected.customerHistory.map(item => (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-admin-line bg-admin-panel px-3 py-2 text-xs">
                      <div>
                        <p className="font-medium text-ink">{item.slotDatetime ? formatShortDate(item.slotDatetime) : 'Sin fecha'}</p>
                        <p className="text-ink-muted">{[item.productType, item.budgetRange].filter(Boolean).join(' · ') || item.name}</p>
                      </div>
                      <div className="text-right">
                        <StatusBadge status={item.status} />
                        {item.commercialStatus && (
                          <p className="mt-1 text-[10px] text-ink-muted">{commercialStatusLabels[item.commercialStatus]}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selected.eventHistory && selected.eventHistory.length > 0 && (
              <div className="rounded-2xl border border-admin-line bg-admin-surface/60 p-4">
                <p className="h-eyebrow mb-3">Historial operativo</p>
                <div className="space-y-2">
                  {selected.eventHistory.map(event => (
                    <div key={event.id} className="rounded-xl border border-admin-line bg-admin-panel px-3 py-2 text-xs">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-medium text-ink">{event.summary || event.action}</p>
                        {event.createdAt && <span className="shrink-0 text-ink-subtle">{formatShortDate(event.createdAt)}</span>}
                      </div>
                      <p className="mt-1 text-ink-muted">{event.actor || 'Sistema'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(selected as SerialAppt & { calendarSyncFailed?: boolean }).calendarSyncFailed && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                La cita quedó confirmada, pero Google Calendar no pudo crear el evento. Revisa diagnósticos y vuelve a intentarlo manualmente si hace falta.
              </div>
            )}

            {selected.appointmentType !== 'video_engagement_rings' ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-admin-line bg-admin-surface px-3 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={16} strokeWidth={1.5} className="text-champagne-solid shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">Identificación titular</p>
                  <p className="text-xs text-ink-muted truncate">
                    {selected.identificationUrl ? 'Archivo protegido' : 'Sin archivo'}
                  </p>
                </div>
              </div>
              {selected.identificationUrl && (
                <a
                  href={`/api/admin/id-url?path=${encodeURIComponent(selected.identificationUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-champagne px-3 py-1.5 text-xs font-medium text-champagne-solid hover:bg-champagne-soft transition-colors"
                >
                  <ExternalLink size={13} strokeWidth={1.5} />
                  Ver
                </a>
              )}
            </div>
            ) : (
              <div className="rounded-xl border border-admin-line bg-admin-surface px-3 py-2.5 text-sm">
                <p className="font-medium text-ink">Consulta por video</p>
                <p className="mt-1 text-xs text-ink-muted">
                  {selected.meetingUrl ? 'El link ya está guardado para emails, calendario y página de estado.' : 'Agrega el link de videollamada en seguimiento comercial.'}
                </p>
              </div>
            )}

            {selected.appointmentType !== 'video_engagement_rings' && (selected.guestCount ?? 0) > 0 && (
              <div className="pt-1">
                <p className="h-eyebrow mb-2">Invitados ({selected.guestCount})</p>
                <GuestsList appointmentId={selected.id} />
              </div>
            )}

            {selected.status === 'pending' && (
              <div className="space-y-3 pt-2 border-t border-ink-line">
                <div>
                  <label className="label-clean">Motivo de rechazo (opcional)</label>
                  <Textarea
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    placeholder="Ej: Sin disponibilidad en esa fecha"
                    rows={3}
                    className="mt-1"
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="gold" className="flex-1" loading={deciding} onClick={() => decide('accept')}>
                    <CheckCircle size={15} strokeWidth={1.5} /> Confirmar
                  </Button>
                  <Button variant="danger" className="flex-1" loading={deciding} onClick={() => decide('reject')}>
                    <XCircle size={15} strokeWidth={1.5} /> Rechazar
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
