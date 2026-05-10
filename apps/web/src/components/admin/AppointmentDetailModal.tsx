'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { CheckCircle, XCircle, Calendar, ExternalLink, FileText, Loader2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { formatShortDate } from '@/lib/utils'
import type { AppointmentStatus } from '@/types'

interface ApptDetail {
  id: string
  slotId: string
  slotDatetime: string
  name: string
  email: string
  phone: string
  notes?: string
  status: AppointmentStatus
  confirmationCode: string
  identificationUrl?: string
  googleCalendarEventId?: string | null
  calendarSyncFailed?: boolean
  decidedBy?: string | null
  decidedAt?: string | null
  adminNote?: string | null
  clientConfirmed?: boolean
  clientConfirmedAt?: string | null
}

interface AvailableSlot {
  id: string
  datetime: string
}

interface Props {
  appointmentId: string | null
  onClose: () => void
  onChanged: () => void
}

export function AppointmentDetailModal({ appointmentId, onClose, onChanged }: Props) {
  const [appt,         setAppt]        = useState<ApptDetail | null>(null)
  const [loading,      setLoading]      = useState(false)
  const [acting,       setActing]       = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showReschedule, setShowReschedule] = useState(false)
  const [slots,        setSlots]        = useState<AvailableSlot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [selectedSlotId, setSelectedSlotId] = useState('')

  const fetchAppt = useCallback(async () => {
    if (!appointmentId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/appointments/${appointmentId}`)
      if (res.status === 401) { window.location.href = '/admin/login'; return }
      if (!res.ok) throw new Error()
      setAppt(await res.json())
    } catch {
      toast.error('Error al cargar la cita')
      onClose()
    } finally {
      setLoading(false)
    }
  }, [appointmentId, onClose])

  useEffect(() => {
    if (appointmentId) {
      setAppt(null)
      setRejectReason('')
      setShowReschedule(false)
      setSelectedSlotId('')
      fetchAppt()
    }
  }, [appointmentId, fetchAppt])

  const loadSlots = useCallback(async () => {
    setSlotsLoading(true)
    try {
      const end = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const res = await fetch(`/api/admin/slots?dateTo=${end}`)
      if (!res.ok) throw new Error()
      const data = await res.json() as { slots: AvailableSlot[] }
      setSlots(data.slots.filter(s => s.id !== appt?.slotId))
    } catch {
      toast.error('Error al cargar slots')
    } finally {
      setSlotsLoading(false)
    }
  }, [appt?.slotId])

  useEffect(() => {
    if (showReschedule) loadSlots()
  }, [showReschedule, loadSlots])

  const decide = async (action: 'accept' | 'reject') => {
    if (!appt) return
    setActing(true)
    try {
      const res = await fetch(`/api/admin/appointments/${appt.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason: rejectReason || undefined }),
      })
      if (!res.ok) {
        const err = await res.json() as { error?: string }
        throw new Error(err.error ?? 'Error')
      }
      toast.success(action === 'accept' ? 'Cita confirmada' : 'Cita rechazada')
      onChanged()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al procesar')
    } finally {
      setActing(false)
    }
  }

  const reschedule = async () => {
    if (!appt || !selectedSlotId) return
    setActing(true)
    try {
      const res = await fetch(`/api/admin/appointments/${appt.id}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newSlotId: selectedSlotId }),
      })
      if (!res.ok) {
        const err = await res.json() as { error?: string }
        throw new Error(err.error ?? 'Error')
      }
      toast.success('Cita reagendada')
      onChanged()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al reagendar')
    } finally {
      setActing(false)
    }
  }

  return (
    <Modal
      open={!!appointmentId}
      onClose={onClose}
      title="Detalle de cita"
      size="md"
    >
      {loading || !appt ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-champagne" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="h-eyebrow mb-1">Solicitud</p>
              <h3 className="font-serif text-2xl font-light text-ink">{appt.name}</h3>
            </div>
            <StatusBadge status={appt.status} />
          </div>

          <dl className="divide-y divide-admin-line rounded-2xl border border-admin-line bg-admin-surface/60 px-4 text-sm">
            {[
              ['Código',   appt.confirmationCode],
              ['Email',    appt.email],
              ['Teléfono', appt.phone],
              ['Fecha',    formatShortDate(appt.slotDatetime)],
              ['Calendar', appt.googleCalendarEventId
                ? 'Sincronizado'
                : appt.calendarSyncFailed
                  ? 'Error de sincronización'
                  : 'Pendiente'],
              ...(appt.decidedBy  ? [['Aprobado por',  appt.decidedBy]] : []),
              ...(appt.decidedAt  ? [['Fecha decisión', formatShortDate(appt.decidedAt)]] : []),
              ...(appt.status === 'accepted'
                ? [['Confirmación cliente', appt.clientConfirmed
                    ? (appt.clientConfirmedAt ? `Sí — ${formatShortDate(appt.clientConfirmedAt)}` : 'Sí')
                    : 'Pendiente']]
                : []),
              ...(appt.adminNote ? [['Nota admin',  appt.adminNote]] : []),
              ...(appt.notes     ? [['Notas',        appt.notes]]    : []),
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between py-2.5 gap-4">
                <dt className="text-ink-muted shrink-0">{label}</dt>
                <dd className="text-ink text-right">{value as string}</dd>
              </div>
            ))}
          </dl>

          {appt.calendarSyncFailed && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              La cita quedó confirmada, pero Google Calendar no pudo crear el evento.
            </div>
          )}

          {appt.identificationUrl && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-admin-line bg-admin-surface px-3 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={16} strokeWidth={1.5} className="text-champagne shrink-0" />
                <p className="text-sm font-medium text-ink">Identificación titular</p>
              </div>
              <a
                href={`/api/admin/id-url?path=${encodeURIComponent(appt.identificationUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-champagne px-3 py-1.5 text-xs font-medium text-champagne hover:bg-champagne-soft transition-colors"
              >
                <ExternalLink size={13} strokeWidth={1.5} /> Ver
              </a>
            </div>
          )}

          {/* Actions for pending appointments */}
          {appt.status === 'pending' && (
            <div className="space-y-3 pt-2 border-t border-admin-line">
              <div>
                <label className="label-clean">Motivo de rechazo (opcional)</label>
                <textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="Ej: Sin disponibilidad en esa fecha"
                  rows={3}
                  className="input-clean mt-1 w-full resize-none"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="gold" className="flex-1" loading={acting} onClick={() => decide('accept')}>
                  <CheckCircle size={15} strokeWidth={1.5} /> Confirmar
                </Button>
                <Button variant="danger" className="flex-1" loading={acting} onClick={() => decide('reject')}>
                  <XCircle size={15} strokeWidth={1.5} /> Rechazar
                </Button>
              </div>
            </div>
          )}

          {/* Reschedule for accepted appointments */}
          {appt.status === 'accepted' && !showReschedule && (
            <div className="pt-2 border-t border-admin-line">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setShowReschedule(true)}
              >
                <Calendar size={14} strokeWidth={1.5} /> Reagendar
              </Button>
            </div>
          )}

          {appt.status === 'accepted' && showReschedule && (
            <div className="space-y-3 pt-2 border-t border-admin-line">
              <p className="text-sm font-medium text-ink">Selecciona el nuevo horario</p>
              {slotsLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 size={18} className="animate-spin text-champagne" />
                </div>
              ) : slots.length === 0 ? (
                <p className="text-sm text-ink-muted text-center py-3">No hay slots disponibles</p>
              ) : (
                <select
                  value={selectedSlotId}
                  onChange={e => setSelectedSlotId(e.target.value)}
                  className="input-clean w-full"
                >
                  <option value="">— Seleccionar horario —</option>
                  {slots.map(s => (
                    <option key={s.id} value={s.id}>
                      {new Date(s.datetime).toLocaleString('es-MX', {
                        timeZone: 'America/Mexico_City',
                        weekday: 'short', day: 'numeric', month: 'short',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </option>
                  ))}
                </select>
              )}
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1"
                  onClick={() => { setShowReschedule(false); setSelectedSlotId('') }}
                  disabled={acting}
                >
                  Cancelar
                </Button>
                <Button
                  variant="gold"
                  size="sm"
                  className="flex-1"
                  loading={acting}
                  disabled={!selectedSlotId}
                  onClick={reschedule}
                >
                  Confirmar cambio
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
