'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { CalendarOff, Trash2, Plus } from 'lucide-react'
import { parseISO } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { es } from 'date-fns/locale'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { BUSINESS_TZ } from '@/lib/utils'

interface BlockedDate { date: string; reason: string; createdBy?: string }

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

  const todayKey = formatInTimeZone(new Date(), BUSINESS_TZ, 'yyyy-MM-dd')

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

  const block = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!from || !to) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/blocked-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: to || from, reason }),
      })
      const data = await res.json().catch(() => ({})) as { blocked?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error')
      toast.success(`${data.blocked} día${data.blocked === 1 ? '' : 's'} bloqueado${data.blocked === 1 ? '' : 's'}`)
      setFrom(''); setTo(''); setReason('')
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
        <form onSubmit={block} className="grid gap-3 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-end">
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
          <Button type="submit" loading={saving} disabled={!from || !to}>
            <Plus size={15} strokeWidth={1.5} /> Bloquear
          </Button>
        </form>
      </Card>

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
