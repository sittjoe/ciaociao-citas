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
import { CheckCircle, XCircle, Download, ChevronDown, ChevronUp, ChevronsUpDown, Search, Users, ExternalLink, FileText, MailCheck, MailQuestion } from 'lucide-react'
import { StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Textarea } from '@/components/ui/Input'
import { GuestsList } from './GuestsList'
import { formatShortDate, csvRow, cn } from '@/lib/utils'
import type { Appointment, AppointmentStatus } from '@/types'

type SerialAppt = Omit<Appointment, 'slotDatetime' | 'createdAt' | 'updatedAt' | 'decidedAt' | 'clientConfirmedAt'> & {
  slotDatetime: string
  createdAt: string
  updatedAt?: string
  decidedAt?: string | null
  clientConfirmedAt?: string | null
}

const col = createColumnHelper<SerialAppt>()

const columns = [
  col.accessor('name', {
    header: 'Nombre',
    cell: info => <span className="font-medium text-ink">{info.getValue()}</span>,
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
        </div>
      )
    },
  }),
]

function SortIcon({ sorted }: { sorted: false | 'asc' | 'desc' }) {
  if (sorted === 'asc')  return <ChevronUp size={13} className="text-champagne" />
  if (sorted === 'desc') return <ChevronDown size={13} className="text-champagne" />
  return <ChevronsUpDown size={13} className="text-ink-subtle opacity-50" />
}

export function AppointmentTable() {
  const [appointments, setAppointments] = useState<SerialAppt[]>([])
  const [loading,     setLoading]       = useState(true)
  const [nextCursor,  setNextCursor]    = useState<string | null>(null)
  const [search,      setSearch]        = useState('')
  const [statusFilter,setStatusFilter]  = useState<AppointmentStatus | ''>('')
  const [sorting,     setSorting]       = useState<SortingState>([])
  const [selected,    setSelected]      = useState<SerialAppt | null>(null)
  const [deciding,    setDeciding]      = useState(false)
  const [rejectReason,setRejectReason]  = useState('')

  const fetchAppointments = useCallback(async (reset = true) => {
    if (reset) setLoading(true)
    const params = new URLSearchParams()
    if (search)       params.set('search', search)
    if (statusFilter) params.set('status', statusFilter)
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
  }, [search, statusFilter, nextCursor])

  useEffect(() => { fetchAppointments(true) }, [search, statusFilter]) // eslint-disable-line

  const decide = useCallback(async (action: 'accept' | 'reject') => {
    if (!selected) return
    setDeciding(true)
    try {
      const res = await fetch(`/api/admin/appointments/${selected.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason: rejectReason || undefined }),
      })
      if (!res.ok) {
        const err = await res.json() as { error?: string }
        throw new Error(err.error ?? 'Error')
      }
      toast.success(action === 'accept' ? 'Cita confirmada' : 'Cita rechazada')
      setSelected(null)
      setRejectReason('')
      fetchAppointments(true)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al procesar')
    } finally {
      setDeciding(false)
    }
  }, [selected, rejectReason, fetchAppointments])

  const exportCSV = useCallback(() => {
    const BOM  = '﻿'
    const head = csvRow(['Código', 'Nombre', 'Email', 'Teléfono', 'Fecha', 'Estado', 'Notas', 'Aprobado por'])
    const rows = appointments.map(a => csvRow([
      a.confirmationCode,
      a.name,
      a.email,
      a.phone,
      new Date(a.slotDatetime).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }),
      a.status,
      a.notes ?? '',
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
      <div className="flex flex-col gap-2 rounded-2xl border border-admin-line bg-admin-panel p-3 sm:flex-row">
        <div className="relative flex-1">
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
          className="input-clean sm:w-44"
        >
          <option value="">Todos los estados</option>
          <option value="pending">Pendientes</option>
          <option value="accepted">Confirmadas</option>
          <option value="rejected">Rechazadas</option>
          <option value="cancelled">Canceladas</option>
        </select>
        <Button variant="outline" size="sm" onClick={exportCSV} className="shrink-0">
          <Download size={14} strokeWidth={1.5} /> CSV
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-admin-line bg-admin-panel">
        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : appointments.length === 0 ? (
          <EmptyState
            title="Sin citas"
            description={search || statusFilter ? 'Ninguna cita coincide con los filtros.' : 'No hay citas registradas aún.'}
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-admin-line bg-admin-surface/70">
                {table.getFlatHeaders().map(header => (
                  <th
                    key={header.id}
                    className={cn(
                      'px-4 py-3 text-left',
                      header.id === 'email' && 'hidden sm:table-cell',
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
                  <tr key={row.id} className="border-b border-admin-line last:border-0 hover:bg-champagne-tint/60 transition-colors">
                    {row.getVisibleCells().map(cell => (
                      <td
                        key={cell.id}
                        className={cn(
                          'px-4 py-3',
                          cell.column.id === 'email' && 'hidden sm:table-cell',
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
                            className="rounded-lg p-1.5 text-ink-subtle transition-colors hover:bg-champagne-tint hover:text-champagne"
                            aria-label={`Ver identificación de ${appt.name}`}
                          >
                            <FileText size={14} strokeWidth={1.5} />
                          </a>
                        )}
                        <button
                          onClick={() => setSelected(appt)}
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
              </div>
              <StatusBadge status={selected.status} />
            </div>

            <dl className="divide-y divide-admin-line rounded-2xl border border-admin-line bg-admin-surface/60 px-4 text-sm">
              {[
                ['Código',    selected.confirmationCode],
                ['Nombre',    selected.name],
                ['Email',     selected.email],
                ['Teléfono',  selected.phone],
                ['Fecha',     formatShortDate(selected.slotDatetime)],
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

            {(selected as SerialAppt & { calendarSyncFailed?: boolean }).calendarSyncFailed && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                La cita quedó confirmada, pero Google Calendar no pudo crear el evento. Revisa diagnósticos y vuelve a intentarlo manualmente si hace falta.
              </div>
            )}

            <div className="flex items-center justify-between gap-3 rounded-xl border border-admin-line bg-admin-surface px-3 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={16} strokeWidth={1.5} className="text-champagne shrink-0" />
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
                  className="inline-flex items-center gap-1.5 rounded-lg border border-champagne px-3 py-1.5 text-xs font-medium text-champagne hover:bg-champagne-soft transition-colors"
                >
                  <ExternalLink size={13} strokeWidth={1.5} />
                  Ver
                </a>
              )}
            </div>

            {(selected.guestCount ?? 0) > 0 && (
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
