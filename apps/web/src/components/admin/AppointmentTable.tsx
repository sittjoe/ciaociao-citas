'use client'

import { useState, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { CheckCircle, XCircle, Download, ChevronDown, Search, Users } from 'lucide-react'
import { StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { GuestsList } from './GuestsList'
import { formatShortDate, csvRow, cn } from '@/lib/utils'
import type { Appointment, AppointmentStatus } from '@/types'

type SerialAppt = Omit<Appointment, 'slotDatetime' | 'createdAt' | 'updatedAt' | 'decidedAt'> & {
  slotDatetime: string
  createdAt: string
  updatedAt?: string
  decidedAt?: string | null
}

export function AppointmentTable() {
  const [appointments, setAppointments] = useState<SerialAppt[]>([])
  const [loading,     setLoading]       = useState(true)
  const [nextCursor,  setNextCursor]    = useState<string | null>(null)
  const [search,      setSearch]        = useState('')
  const [statusFilter,setStatusFilter]  = useState<AppointmentStatus | ''>('')
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

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
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
          className="input-clean sm:w-40"
        >
          <option value="">Todos</option>
          <option value="pending">Pendientes</option>
          <option value="accepted">Confirmadas</option>
          <option value="rejected">Rechazadas</option>
          <option value="cancelled">Canceladas</option>
        </select>
        <Button variant="outline" size="sm" onClick={exportCSV} className="shrink-0">
          <Download size={14} /> CSV
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-stone-100 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-100">
              {['Nombre', 'Fecha/Hora', 'Email', 'Estado', 'Acciones'].map(h => (
                <th key={h} className={cn('px-4 py-3 text-left text-xs text-ink-muted tracking-widest uppercase font-semibold', h === 'Email' && 'hidden sm:table-cell')}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-ink-muted">Cargando…</td>
              </tr>
            )}
            {!loading && appointments.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-ink-muted">Sin resultados</td>
              </tr>
            )}
            {appointments.map(appt => (
              <tr
                key={appt.id}
                className="border-b border-stone-100 hover:bg-cream-soft transition-colors"
              >
                <td className="px-4 py-3 text-ink font-medium">{appt.name}</td>
                <td className="px-4 py-3 text-ink-muted whitespace-nowrap">
                  {formatShortDate(appt.slotDatetime)}
                </td>
                <td className="hidden sm:table-cell px-4 py-3 text-ink-muted text-xs">{appt.email}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <StatusBadge status={appt.status} />
                    {(appt.guestCount ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-stone-100 text-stone-500">
                        <Users size={9} />
                        {appt.guestCount}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {appt.status === 'pending' && (
                    <button
                      onClick={() => setSelected(appt)}
                      className="text-xs text-champagne-deep hover:text-champagne underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne-deep rounded"
                      aria-label={`Gestionar cita de ${appt.name}`}
                    >
                      Gestionar
                    </button>
                  )}
                  {appt.status !== 'pending' && (
                    <button
                      onClick={() => setSelected(appt)}
                      className="text-xs text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne-deep rounded"
                      aria-label={`Ver cita de ${appt.name}`}
                    >
                      Ver
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Load more */}
      {nextCursor && (
        <div className="text-center">
          <Button variant="outline" size="sm" onClick={() => fetchAppointments(false)}>
            <ChevronDown size={14} /> Cargar más
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
            <div className="divide-y divide-stone-100 text-sm">
              {[
                ['Código',    selected.confirmationCode],
                ['Nombre',    selected.name],
                ['Email',     selected.email],
                ['Teléfono',  selected.phone],
                ['Fecha',     formatShortDate(selected.slotDatetime)],
                ['Calendar',  selected.googleCalendarEventId
                  ? 'Sincronizado'
                  : selected.calendarSyncFailed
                    ? '⚠ Error de sincronización'
                    : 'Pendiente'],
                ['Estado',    null],
                ...(selected.decidedBy ? [['Aprobado por', selected.decidedBy]] : []),
                ...(selected.decidedAt ? [['Fecha decisión', formatShortDate(selected.decidedAt)]] : []),
                ...(selected.adminNote ? [['Nota', selected.adminNote]] : []),
                ...(selected.notes ? [['Notas cliente', selected.notes]] : []),
              ].map(([label, value]) => (
                <div key={label as string} className="flex justify-between py-2">
                  <span className="text-ink-muted">{label}</span>
                  {value !== null
                    ? <span className="text-ink max-w-[60%] text-right">{value}</span>
                    : <StatusBadge status={selected.status} />
                  }
                </div>
              ))}
            </div>

            {(selected.guestCount ?? 0) > 0 && (
              <div className="pt-2">
                <p className="text-xs text-ink-muted font-semibold tracking-widest uppercase mb-2">
                  Invitados ({selected.guestCount})
                </p>
                <GuestsList appointmentId={selected.id} />
              </div>
            )}

            {selected.status === 'pending' && (
              <div className="space-y-3 pt-2">
                <div>
                  <label className="label-clean">Motivo de rechazo (opcional)</label>
                  <input
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    placeholder="Ej: Sin disponibilidad en esa fecha"
                    className="input-clean"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="gold"
                    className="flex-1"
                    loading={deciding}
                    onClick={() => decide('accept')}
                  >
                    <CheckCircle size={15} /> Confirmar
                  </Button>
                  <Button
                    variant="danger"
                    className="flex-1"
                    loading={deciding}
                    onClick={() => decide('reject')}
                  >
                    <XCircle size={15} /> Rechazar
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
