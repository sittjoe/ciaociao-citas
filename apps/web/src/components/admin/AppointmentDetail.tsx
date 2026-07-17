'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { CheckCircle, XCircle, Calendar, ExternalLink, FileText, Loader2, Mail, MessageCircle, Save } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { Textarea } from '@/components/ui/Input'
import { GuestsList } from './GuestsList'
import { formatShortDate, cn } from '@/lib/utils'
import { appointmentTypeLabels, commercialStatusLabels, engagementBriefRows, formatWhatsAppUrl } from '@/lib/commercial'
import { commercialStatusOptions } from '@/lib/schemas'
import type { Appointment, AppointmentStatus, AppointmentType, CommercialPriority, CommercialStatus } from '@/types'

export type CustomerHistoryItem = {
  id: string
  name: string
  status: AppointmentStatus
  appointmentType?: AppointmentType
  slotDatetime: string | null
  productType?: string
  budgetRange?: string
  commercialStatus?: CommercialStatus
}

export type AppointmentEventItem = {
  id: string
  action: string
  actor: string
  summary: string
  createdAt: string | null
}

/** Cita serializada tal como llega de las APIs admin (fechas como ISO string). */
export type SerialAppointment = Omit<
  Appointment,
  'slotDatetime' | 'createdAt' | 'updatedAt' | 'decidedAt' | 'clientConfirmedAt' | 'followUpAt' | 'attendedAt' | 'autoCancelledAt'
> & {
  slotDatetime: string
  createdAt: string
  updatedAt?: string | null
  decidedAt?: string | null
  clientConfirmedAt?: string | null
  followUpAt?: string | null
  attendedAt?: string | null
  autoCancelledAt?: string | null
  commercialPriority?: CommercialPriority
  customerHistory?: CustomerHistoryItem[]
  eventHistory?: AppointmentEventItem[]
}

type AdminSlot = {
  id: string
  datetime: string
  available: boolean
  slotType?: AppointmentType
}

interface AppointmentDetailProps {
  /** Id de la cita a mostrar; null cierra el modal. */
  appointmentId: string | null
  /** Datos ya conocidos (fila de la tabla) para pintar al instante mientras carga el detalle. */
  initialData?: SerialAppointment | null
  onClose: () => void
  /**
   * Parche optimista tras cada acción (decisión, asistencia, seguimiento, reagenda).
   * La tabla lo aplica en su fila; el calendario puede simplemente refrescar.
   */
  onUpdated?: (id: string, patch: Partial<SerialAppointment>) => void
}

export function AppointmentDetail({ appointmentId, initialData, onClose, onUpdated }: AppointmentDetailProps) {
  const [appt, setAppt] = useState<SerialAppointment | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [deciding, setDeciding] = useState(false)
  const [savingCommercial, setSavingCommercial] = useState(false)
  const [resending, setResending] = useState(false)
  const [rescheduling, setRescheduling] = useState(false)

  const [rejectReason, setRejectReason] = useState('')
  const [commercialStatus, setCommercialStatus] = useState<CommercialStatus>('pending')
  const [internalNote, setInternalNote] = useState('')
  const [followUpAt, setFollowUpAt] = useState('')
  const [meetingUrl, setMeetingUrl] = useState('')
  const [meetingProvider, setMeetingProvider] = useState('')
  const [meetingInstructions, setMeetingInstructions] = useState('')

  const [showReschedule, setShowReschedule] = useState(false)
  const [slots, setSlots] = useState<AdminSlot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [selectedSlotId, setSelectedSlotId] = useState('')

  // Refs para no re-disparar el efecto de carga cuando cambian identidades por render.
  const initialRef = useRef(initialData)
  initialRef.current = initialData
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const applyFormState = (data: SerialAppointment) => {
    setCommercialStatus(data.commercialStatus ?? 'pending')
    setInternalNote(data.internalNote ?? '')
    setFollowUpAt(data.followUpAt ? data.followUpAt.slice(0, 16) : '')
    setMeetingUrl(data.meetingUrl ?? '')
    setMeetingProvider(data.meetingProvider ?? '')
    setMeetingInstructions(data.meetingInstructions ?? '')
  }

  // Carga el detalle completo al abrir. Si hay initialData se pinta de inmediato
  // y el detalle (historial, eventos) llega en segundo plano.
  useEffect(() => {
    if (!appointmentId) {
      setAppt(null)
      return
    }
    setRejectReason('')
    setShowReschedule(false)
    setSelectedSlotId('')
    setSlots([])
    const initial = initialRef.current && initialRef.current.id === appointmentId ? initialRef.current : null
    setAppt(initial)
    if (initial) applyFormState(initial)

    let cancelled = false
    setDetailLoading(true)
    void (async () => {
      try {
        const res = await fetch(`/api/admin/appointments/${appointmentId}`)
        if (res.status === 401) {
          window.location.href = `/admin/login?from=${encodeURIComponent(window.location.pathname)}`
          return
        }
        if (!res.ok) throw new Error()
        const detail = await res.json() as SerialAppointment
        if (cancelled) return
        setAppt(prev => prev && prev.id === appointmentId ? { ...prev, ...detail } : detail)
        applyFormState(detail)
      } catch {
        if (cancelled) return
        if (initial) {
          toast.error('No se pudo cargar el historial del cliente')
        } else {
          toast.error('Error al cargar la cita')
          onCloseRef.current()
        }
      } finally {
        if (!cancelled) setDetailLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [appointmentId])

  const loadSlots = useCallback(async () => {
    if (!appt) return
    setSlotsLoading(true)
    try {
      const end = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const res = await fetch(`/api/admin/slots?dateTo=${end}`)
      if (!res.ok) throw new Error()
      const data = await res.json() as { slots: AdminSlot[] }
      const type = appt.appointmentType ?? 'showroom'
      setSlots(data.slots.filter(s =>
        s.id !== appt.slotId &&
        s.available &&
        (s.slotType ?? 'showroom') === type &&
        new Date(s.datetime) > new Date()
      ))
    } catch {
      toast.error('Error al cargar slots')
    } finally {
      setSlotsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appt?.id, appt?.slotId, appt?.appointmentType])

  useEffect(() => {
    if (showReschedule) void loadSlots()
  }, [showReschedule, loadSlots])

  const markAttendance = useCallback(async (attended: boolean) => {
    if (!appt) return
    setDeciding(true)
    try {
      const res = await fetch(`/api/admin/appointments/${appt.id}/attend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attended }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? 'Error')
      }
      toast.success(attended ? 'Marcada como asistió' : 'Marcada como no asistió')
      setAppt(prev => prev ? { ...prev, attended } : prev)
      onUpdated?.(appt.id, { attended })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar asistencia')
    } finally {
      setDeciding(false)
    }
  }, [appt, onUpdated])

  const decide = useCallback(async (action: 'accept' | 'reject') => {
    if (!appt) return
    if (
      action === 'accept' &&
      appt.appointmentType === 'video_engagement_rings' &&
      !meetingUrl.trim()
    ) {
      const ok = window.confirm('Esta video consulta no tiene link guardado. Puedes aceptarla, pero el cliente recibirá que el enlace está pendiente. ¿Aceptar de todos modos?')
      if (!ok) return
    }
    setDeciding(true)
    try {
      const res = await fetch(`/api/admin/appointments/${appt.id}/decision`, {
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
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? 'Error')
      }
      toast.success(action === 'accept' ? 'Cita confirmada' : 'Cita rechazada')
      const newStatus: AppointmentStatus = action === 'accept' ? 'accepted' : 'rejected'
      onUpdated?.(appt.id, { status: newStatus, clientConfirmed: false })
      setRejectReason('')
      onClose()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al procesar')
    } finally {
      setDeciding(false)
    }
  }, [appt, rejectReason, meetingUrl, meetingProvider, meetingInstructions, onUpdated, onClose])

  const saveCommercial = useCallback(async () => {
    if (!appt) return
    setSavingCommercial(true)
    try {
      const followUpIso = followUpAt ? new Date(followUpAt).toISOString() : ''
      const res = await fetch(`/api/admin/appointments/${appt.id}/commercial`, {
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
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? 'Error')
      }
      toast.success('Seguimiento actualizado')
      const patch: Partial<SerialAppointment> = {
        commercialStatus,
        internalNote,
        followUpAt: followUpIso || null,
        meetingUrl,
        meetingProvider,
        meetingInstructions,
      }
      setAppt(prev => prev ? { ...prev, ...patch } : prev)
      onUpdated?.(appt.id, patch)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar seguimiento')
    } finally {
      setSavingCommercial(false)
    }
  }, [appt, commercialStatus, internalNote, followUpAt, meetingUrl, meetingProvider, meetingInstructions, onUpdated])

  const reschedule = useCallback(async () => {
    if (!appt || !selectedSlotId) return
    setRescheduling(true)
    try {
      const res = await fetch(`/api/admin/appointments/${appt.id}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newSlotId: selectedSlotId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? 'Error')
      }
      toast.success('Cita reagendada')
      const newSlot = slots.find(s => s.id === selectedSlotId)
      onUpdated?.(appt.id, {
        ...(newSlot ? { slotId: newSlot.id, slotDatetime: newSlot.datetime } : {}),
        clientConfirmed: false,
      })
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al reagendar')
    } finally {
      setRescheduling(false)
    }
  }, [appt, selectedSlotId, slots, onUpdated, onClose])

  const resendAppointmentEmail = useCallback(async () => {
    if (!appt) return
    setResending(true)
    try {
      const res = await fetch(`/api/admin/appointments/${appt.id}/resend`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? 'Error')
      }
      toast.success('Email reenviado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al reenviar email')
    } finally {
      setResending(false)
    }
  }, [appt])

  return (
    <Modal
      open={!!appointmentId}
      onClose={onClose}
      title="Detalle de cita"
      size="md"
    >
      {!appt ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-champagne-solid" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="h-eyebrow mb-1">Solicitud</p>
              <h3 className="font-serif text-2xl font-light text-ink">{appt.name}</h3>
              {detailLoading && <p className="mt-1 text-xs text-ink-muted">Cargando historial...</p>}
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusBadge status={appt.status} />
              <span className={cn(
                'inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                appt.commercialPriority === 'high' && 'border-red-200 bg-red-50 text-red-600',
                appt.commercialPriority === 'medium' && 'border-amber-200 bg-amber-50 text-amber-700',
                (!appt.commercialPriority || appt.commercialPriority === 'normal') && 'border-admin-line bg-admin-surface text-ink-muted',
              )}>
                {appt.commercialPriority === 'high' ? 'Prioridad alta' : appt.commercialPriority === 'medium' ? 'Prioridad media' : 'Prioridad normal'}
              </span>
            </div>
          </div>

          <dl className="divide-y divide-admin-line rounded-2xl border border-admin-line bg-admin-surface/60 px-4 text-sm">
            {[
              ['Código',    appt.confirmationCode],
              ['Tipo',      appointmentTypeLabels[appt.appointmentType ?? 'showroom']],
              ['Nombre',    appt.name],
              ['Email',     appt.email],
              ['Teléfono',  appt.phone],
              ['Fecha',     formatShortDate(appt.slotDatetime)],
              ...(appt.productType ? [['Producto', appt.productType]] : []),
              ...(appt.budgetRange ? [['Presupuesto', appt.budgetRange]] : []),
              ...(appt.lookingFor ? [['Busca', appt.lookingFor]] : []),
              ...engagementBriefRows(appt.engagementBrief),
              ...(appt.meetingUrl ? [['Link videollamada', appt.meetingUrl]] : []),
              ...(appt.meetingInstructions ? [['Instrucciones video', appt.meetingInstructions]] : []),
              ['Seguimiento', appt.commercialStatus ? commercialStatusLabels[appt.commercialStatus] : 'Pendiente'],
              ...(appt.followUpAt ? [['Follow-up', formatShortDate(appt.followUpAt)]] : []),
              ['Calendar',  appt.googleCalendarEventId
                ? 'Sincronizado'
                : appt.calendarSyncFailed
                  ? 'Error de sincronización'
                  : 'Pendiente'],
              ...(appt.decidedBy ? [['Aprobado por', appt.decidedBy]] : []),
              ...(appt.decidedAt ? [['Fecha decisión', formatShortDate(appt.decidedAt)]] : []),
              ...(appt.status === 'accepted'
                ? [['Confirmación cliente', appt.clientConfirmed
                    ? (appt.clientConfirmedAt ? `Sí — ${formatShortDate(appt.clientConfirmedAt)}` : 'Sí')
                    : 'Pendiente']]
                : []),
              ...(appt.adminNote ? [['Nota admin', appt.adminNote]] : []),
              ...(appt.notes ? [['Notas cliente', appt.notes]] : []),
              ...(appt.internalNote ? [['Notas internas', appt.internalNote]] : []),
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between py-2.5 gap-4">
                <dt className="text-ink-muted shrink-0">{label}</dt>
                <dd className="text-ink text-right">{value as string}</dd>
              </div>
            ))}
            <div className="flex justify-between py-2.5 gap-4">
              <dt className="text-ink-muted">Estado</dt>
              <dd><StatusBadge status={appt.status} /></dd>
            </div>
          </dl>

          <div className="rounded-2xl border border-admin-line bg-admin-surface/60 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="h-eyebrow mb-1">Seguimiento comercial</p>
                <p className="text-xs text-ink-muted">Uso interno del equipo. No se muestra al cliente.</p>
              </div>
              {appt.phone && (
                <a
                  href={formatWhatsAppUrl(appt.phone, appt.name)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Escribir a ${appt.name} por WhatsApp`}
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
            {appt.appointmentType === 'video_engagement_rings' && (
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
                {!meetingUrl && appt.status === 'accepted' && (
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
          {appt.status === 'accepted' && (
            <div className="rounded-2xl border border-admin-line bg-admin-surface/60 p-4">
              <div className="mb-3">
                <p className="h-eyebrow mb-1">Asistencia</p>
                <p className="text-xs text-ink-muted">
                  {appt.attended === true ? 'Registrada como asistió.'
                    : appt.attended === false ? 'Registrada como no se presentó.'
                    : 'Marca si el cliente acudió a su cita. Los no-shows se excluyen de la conversión.'}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant={appt.attended === true ? 'gold' : 'outline'}
                  size="sm" className="flex-1" loading={deciding}
                  onClick={() => void markAttendance(true)}
                >
                  <CheckCircle size={14} strokeWidth={1.5} /> Asistió
                </Button>
                <Button
                  variant={appt.attended === false ? 'danger' : 'ghost'}
                  size="sm" className="flex-1" loading={deciding}
                  onClick={() => void markAttendance(false)}
                >
                  <XCircle size={14} strokeWidth={1.5} /> No asistió
                </Button>
              </div>
            </div>
          )}

          {/* Reschedule — only for confirmed appointments */}
          {appt.status === 'accepted' && (
            <div className="rounded-2xl border border-admin-line bg-admin-surface/60 p-4">
              <div className="mb-3">
                <p className="h-eyebrow mb-1">Reagendar</p>
                <p className="text-xs text-ink-muted">Mueve la cita a otro horario disponible. El cliente recibe la nueva fecha por correo.</p>
              </div>
              {!showReschedule ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full min-h-[44px]"
                  onClick={() => setShowReschedule(true)}
                >
                  <Calendar size={14} strokeWidth={1.5} /> Reagendar cita
                </Button>
              ) : (
                <div className="space-y-3">
                  <label htmlFor="reschedule-slot" className="block text-sm font-medium text-ink">Selecciona el nuevo horario</label>
                  {slotsLoading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 size={18} className="animate-spin text-champagne-solid" />
                    </div>
                  ) : slots.length === 0 ? (
                    <p className="text-sm text-ink-muted text-center py-3">No hay horarios disponibles</p>
                  ) : (
                    <select
                      id="reschedule-slot"
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
                      className="flex-1 min-h-[44px]"
                      onClick={() => { setShowReschedule(false); setSelectedSlotId('') }}
                      disabled={rescheduling}
                    >
                      Cancelar
                    </Button>
                    <Button
                      variant="gold"
                      size="sm"
                      className="flex-1 min-h-[44px]"
                      loading={rescheduling}
                      disabled={!selectedSlotId}
                      onClick={() => void reschedule()}
                    >
                      Confirmar cambio
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {appt.customerHistory && appt.customerHistory.length > 0 && (
            <div className="rounded-2xl border border-admin-line bg-admin-surface/60 p-4">
              <p className="h-eyebrow mb-3">Historial cliente</p>
              <div className="space-y-2">
                {appt.customerHistory.map(item => (
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

          {appt.eventHistory && appt.eventHistory.length > 0 && (
            <div className="rounded-2xl border border-admin-line bg-admin-surface/60 p-4">
              <p className="h-eyebrow mb-3">Historial operativo</p>
              <div className="space-y-2">
                {appt.eventHistory.map(event => (
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

          {appt.calendarSyncFailed && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              La cita quedó confirmada, pero Google Calendar no pudo crear el evento. Revisa diagnósticos y vuelve a intentarlo manualmente si hace falta.
            </div>
          )}

          {appt.appointmentType !== 'video_engagement_rings' ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-admin-line bg-admin-surface px-3 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <FileText size={16} strokeWidth={1.5} className="text-champagne-solid shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">Identificación titular</p>
                <p className="text-xs text-ink-muted truncate">
                  {appt.identificationUrl ? 'Archivo protegido' : 'Sin archivo'}
                </p>
              </div>
            </div>
            {appt.identificationUrl && (
              <a
                href={`/api/admin/id-url?path=${encodeURIComponent(appt.identificationUrl)}`}
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
                {appt.meetingUrl ? 'El link ya está guardado para emails, calendario y página de estado.' : 'Agrega el link de videollamada en seguimiento comercial.'}
              </p>
            </div>
          )}

          {/* Resend status email */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-admin-line bg-admin-surface px-3 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <Mail size={16} strokeWidth={1.5} className="text-champagne-solid shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">Email de estado</p>
                <p className="text-xs text-ink-muted truncate">Reenvía al cliente el correo según el estado actual.</p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-[44px] shrink-0"
              loading={resending}
              onClick={() => void resendAppointmentEmail()}
            >
              Reenviar
            </Button>
          </div>

          {appt.appointmentType !== 'video_engagement_rings' && (appt.guestCount ?? 0) > 0 && (
            <div className="pt-1">
              <p className="h-eyebrow mb-2">Invitados ({appt.guestCount})</p>
              <GuestsList appointmentId={appt.id} />
            </div>
          )}

          {appt.status === 'pending' && (
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
                <Button variant="gold" className="flex-1" loading={deciding} onClick={() => void decide('accept')}>
                  <CheckCircle size={15} strokeWidth={1.5} /> Confirmar
                </Button>
                <Button variant="danger" className="flex-1" loading={deciding} onClick={() => void decide('reject')}>
                  <XCircle size={15} strokeWidth={1.5} /> Rechazar
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
