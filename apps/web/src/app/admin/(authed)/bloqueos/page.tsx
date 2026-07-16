'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { CalendarOff, Trash2, Plus } from 'lucide-react'
import { parseISO } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { es } from 'date-fns/locale'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { AlertDialog } from '@/components/ui/AlertDialog'
import { StatusBadge } from '@/components/ui/Badge'
import { BUSINESS_TZ, formatShortDate } from '@/lib/utils'
import type { AppointmentStatus } from '@/types'

interface BlockedDate { date: string; reason: string; createdBy?: string }

interface ImpactAppointment { id: string; name: string; datetime: string; status: string }

interface Impact {
  from: string
  to: string
  freeSlots: number
  occupiedSlots: number
  appointments: ImpactAppointment[]
}

function formatDay(key: string): string {
  const s = formatInTimeZone(parseISO(`${key}T12:00:00Z`), 'UTC', "EEEE d 'de' MMMM, yyyy", { locale: es })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function BloqueosPage() {
  const [dates,   setDates]   = useState<BlockedDate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [from,    setFrom]    = useState('')
  const [to,      setTo]      = useState('')
  const [reason,  setReason]  = useState('')

  const [impact,        setImpact]        = useState<Impact | null>(null)
  const [impactLoading, setImpactLoading] = useState(false)
  const [deleteFree,    setDeleteFree]    = useState(true)
  const [confirmOpen,   setConfirmOpen]   = useState(false)

  const todayKey = formatInTimeZone(new Date(), BUSINESS_TZ, 'yyyy-MM-dd')
  const rangeReady = Boolean(from && to && from <= to)

  const fetchDates = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/blocked-dates')
      if (res.status === 401) { window.location.href = '/admin/login'; return }
      if (!res.ok) throw new Error()
      const data = await res.json() as { blockedDates: BlockedDate[] }
      setDates(data.blockedDates)
    } catch {
      toast.error('Error al cargar días bloqueados')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchDates() }, [fetchDates])

  // Impacto del bloqueo: se calcula en cuanto hay un rango válido, con un
  // pequeño debounce para no disparar una consulta por cada tecla del date picker.
  useEffect(() => {
    if (!rangeReady) { setImpact(null); return }
    setImpactLoading(true)
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/blocked-dates/impact?from=${from}&to=${to}`, { signal: ctrl.signal })
        if (!res.ok) throw new Error()
        setImpact(await res.json() as Impact)
        setImpactLoading(false)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setImpact(null)
        setImpactLoading(false)
      }
    }, 350)
    return () => { clearTimeout(timer); ctrl.abort() }
  }, [rangeReady, from, to])

  const requestBlock = (e: React.FormEvent) => {
    e.preventDefault()
    if (!rangeReady) return
    setConfirmOpen(true)
  }

  const confirmBlock = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/blocked-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to,
          reason,
          deleteFreeSlots: deleteFree && (impact?.freeSlots ?? 0) > 0,
        }),
      })
      const data = await res.json().catch(() => ({})) as { blocked?: number; slotsDeleted?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error')
      const blocked = data.blocked ?? 0
      const deleted = data.slotsDeleted ?? 0
      toast.success(
        `${blocked} día${blocked === 1 ? '' : 's'} bloqueado${blocked === 1 ? '' : 's'}` +
        (deleted > 0 ? ` · ${deleted} horario${deleted === 1 ? '' : 's'} eliminado${deleted === 1 ? '' : 's'}` : ''),
      )
      setConfirmOpen(false)
      setFrom(''); setTo(''); setReason(''); setImpact(null); setDeleteFree(true)
      fetchDates()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo bloquear')
    } finally {
      setSaving(false)
    }
  }

  const unblock = async (date: string) => {
    try {
      const res = await fetch(`/api/admin/blocked-dates?date=${date}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setDates(prev => prev.filter(d => d.date !== date))
      toast.success('Día desbloqueado')
    } catch {
      toast.error('No se pudo desbloquear')
    }
  }

  const upcoming = dates.filter(d => d.date >= todayKey)
  const past = dates.filter(d => d.date < todayKey)

  const affected = impact?.appointments ?? []
  const willDeleteFree = deleteFree && (impact?.freeSlots ?? 0) > 0

  const impactSummary = impact
    ? [
        impact.freeSlots > 0
          ? (deleteFree
            ? `${impact.freeSlots} horario${impact.freeSlots === 1 ? ' libre se eliminará' : 's libres se eliminarán'}`
            : `${impact.freeSlots} horario${impact.freeSlots === 1 ? ' libre se conservará' : 's libres se conservarán'}`)
          : null,
        affected.length > 0
          ? `${affected.length} cita${affected.length === 1 ? ' requiere' : 's requieren'} tu atención`
          : null,
      ].filter(Boolean).join(' · ')
    : ''

  const confirmDescription = impact
    ? [
        from === to ? formatDay(from) : `Del ${formatDay(from).toLowerCase()} al ${formatDay(to).toLowerCase()}`,
        willDeleteFree
          ? `Se eliminarán ${impact.freeSlots} horario${impact.freeSlots === 1 ? ' libre' : 's libres'}.`
          : 'No se eliminará ningún horario.',
        affected.length > 0
          ? `${affected.length} cita${affected.length === 1 ? '' : 's'} permanecerá${affected.length === 1 ? '' : 'n'} agendada${affected.length === 1 ? '' : 's'} en esos días; tendrás que reagendarla${affected.length === 1 ? '' : 's'} a mano.`
          : null,
      ].filter(Boolean).join(' ')
    : 'No se pudo calcular el impacto; solo se bloquearán las fechas, sin eliminar horarios.'

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <p className="h-eyebrow mb-2">Disponibilidad</p>
        <h1 className="font-serif text-2xl text-ink">Días bloqueados</h1>
        <p className="text-sm text-ink-muted mt-1">
          Cierra fechas por vacaciones o eventos. No se crearán slots en esos días y no aparecerán en el calendario de reservas.
        </p>
      </div>

      <Card variant="admin" className="p-5">
        <form onSubmit={requestBlock}>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-end">
            <div>
              <label htmlFor="block-from" className="label-clean">Desde</label>
              <input id="block-from" type="date" value={from} min={todayKey} max={to || undefined}
                onChange={e => setFrom(e.target.value)} required
                className="input-clean mt-1 h-10 min-h-0" />
            </div>
            <div>
              <label htmlFor="block-to" className="label-clean">Hasta</label>
              <input id="block-to" type="date" value={to} min={from || todayKey}
                onChange={e => setTo(e.target.value)} required
                className="input-clean mt-1 h-10 min-h-0" />
            </div>
            <div>
              <label htmlFor="block-reason" className="label-clean">Motivo (opcional)</label>
              <input id="block-reason" type="text" value={reason} maxLength={120}
                onChange={e => setReason(e.target.value)} placeholder="Vacaciones, evento privado…"
                className="input-clean mt-1 h-10 min-h-0" />
            </div>
            <Button type="submit" loading={saving} disabled={!rangeReady || impactLoading}>
              <Plus size={15} strokeWidth={1.5} /> Bloquear
            </Button>
          </div>

          {rangeReady && (
            <div className="mt-4 border-t border-admin-line pt-4">
              {impactLoading ? (
                <p className="text-sm text-ink-muted">Calculando impacto…</p>
              ) : !impact ? (
                <p className="text-sm text-ink-muted">
                  No se pudo calcular el impacto. Puedes bloquear de todas formas; no se eliminará ningún horario.
                </p>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-ink">
                    {impactSummary || 'Sin horarios ni citas en esos días.'}
                  </p>

                  {impact.freeSlots > 0 && (
                    <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        checked={deleteFree}
                        onChange={e => setDeleteFree(e.target.checked)}
                        className="h-4 w-4 shrink-0 cursor-pointer accent-champagne-solid"
                      />
                      <span className="text-sm text-ink">
                        Además, eliminar {impact.freeSlots === 1 ? 'el horario libre' : `los ${impact.freeSlots} horarios libres`} de {from === to ? 'ese día' : 'esos días'}
                      </span>
                    </label>
                  )}

                  {affected.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-ink-muted">
                        Estas citas no se modifican al bloquear; reagéndalas a mano desde su ficha.
                      </p>
                      {affected.map(appt => (
                        <div key={appt.id} className="rounded-xl border border-admin-line bg-admin-surface px-3 py-2 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-medium text-ink truncate">{appt.name}</p>
                              <div className="mt-0.5 flex items-center gap-2">
                                <p className="text-xs text-ink-muted">{formatShortDate(appt.datetime)}</p>
                                <StatusBadge status={appt.status as AppointmentStatus} />
                              </div>
                            </div>
                            <Link
                              className="shrink-0 py-3 text-xs font-medium text-champagne-deep hover:underline"
                              href={`/admin/citas?open=${appt.id}`}
                            >
                              Abrir cita
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </form>
      </Card>

      <AlertDialog
        open={confirmOpen}
        onCancel={() => { if (!saving) setConfirmOpen(false) }}
        onConfirm={confirmBlock}
        title={rangeReady && from !== to ? 'Bloquear estas fechas' : 'Bloquear esta fecha'}
        description={confirmDescription}
        confirmLabel="Bloquear"
        variant="danger"
        loading={saving}
      />

      {loading ? (
        <p className="text-sm text-ink-muted">Cargando…</p>
      ) : upcoming.length === 0 && past.length === 0 ? (
        <Card variant="admin">
          <EmptyState title="Sin días bloqueados" description="Bloquea un rango de fechas para cerrar la agenda esos días." />
        </Card>
      ) : (
        <div className="space-y-4">
          {upcoming.length > 0 && (
            <Card variant="admin" className="divide-y divide-admin-line">
              {upcoming.map(d => (
                <div key={d.date} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <CalendarOff size={16} strokeWidth={1.5} className="text-champagne-solid shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{formatDay(d.date)}</p>
                      {d.reason && <p className="text-xs text-ink-muted truncate">{d.reason}</p>}
                    </div>
                  </div>
                  <button onClick={() => unblock(d.date)} aria-label={`Desbloquear ${d.date}`}
                    className="rounded-lg p-1.5 text-ink-subtle hover:bg-red-50 hover:text-red-500 transition-colors focus-visible:outline-none focus-visible:shadow-focus-ring">
                    <Trash2 size={15} strokeWidth={1.5} />
                  </button>
                </div>
              ))}
            </Card>
          )}
          {past.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-ink-muted hover:text-ink">Días pasados ({past.length})</summary>
              <Card variant="admin" className="mt-2 divide-y divide-admin-line opacity-70">
                {past.map(d => (
                  <div key={d.date} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <p className="text-sm text-ink-muted">{formatDay(d.date)}</p>
                    <button onClick={() => unblock(d.date)} aria-label={`Desbloquear ${d.date}`}
                      className="rounded-lg p-1.5 text-ink-subtle hover:bg-red-50 hover:text-red-500 transition-colors">
                      <Trash2 size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                ))}
              </Card>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
