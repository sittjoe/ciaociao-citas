'use client'

import { useId, useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle, XCircle, Calendar, ChevronDown, ExternalLink, FileText, Loader2, Mail, MessageCircle, Save } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Textarea } from '@/components/ui/Input'
import { GuestsList } from './GuestsList'
import { formatShortDate, cn, BUSINESS_TZ } from '@/lib/utils'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
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

const priorityClass: Record<CommercialPriority, string> = {
  high:   'border-red-200 bg-red-50 text-red-600',
  medium: 'border-amber-200 bg-amber-50 text-amber-700',
  normal: 'border-admin-line bg-admin-surface text-ink-muted',
}
const priorityLabelLong: Record<CommercialPriority, string> = {
  high:   'Prioridad alta',
  medium: 'Prioridad media',
  normal: 'Prioridad normal',
}

/** Sección plegable para contenido de referencia (historiales) — reduce el muro en iPhone. */
function Disclosure({
  title,
  count,
  children,
}: {
  title: string
  count?: number
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-2xl border border-admin-line bg-admin-surface/60">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left focus-visible:outline-none focus-visible:shadow-focus-ring"
      >
        <span className="h-eyebrow">
          {title}{typeof count === 'number' ? ` (${count})` : ''}
        </span>
        <ChevronDown
          size={16}
          strokeWidth={1.5}
          className={cn('shrink-0 text-ink-subtle transition-transform duration-200 ease-quart', open && 'rotate-180')}
        />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

export function AppointmentDetail({ appointmentId, initialData, onClose, onUpdated }: AppointmentDetailProps) {
  const uid = useId()
  const [appt, setAppt] = useState<SerialAppointment | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(false)
  const [retryTick, setRetryTick] = useState(0)
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
    // El input datetime-local es "hora de pared" CDMX; el ISO viene en UTC.
    setFollowUpAt(data.followUpAt ? formatInTimeZone(new Date(data.followUpAt), BUSINESS_TZ, "yyyy-MM-dd'T'HH:mm") : '')
    setMeetingUrl(data.meetingUrl ?? '')
    setMeetingProvider(data.meetingProvider ?? '')
    setMeetingInstructions(data.meetingInstructions ?? '')
  }

  // Carga el detalle completo al abrir. Si hay initialData se pinta de inmediato
  // y el detalle (historial, eventos) llega en segundo plano. Si no hay datos y
  // la carga falla, se muestra un estado de error con reintento (no se cierra).
  useEffect(() => {
    if (!appointmentId) {
      setAppt(null)
      setDetailError(false)
      return
    }
    setRejectReason('')
    setShowReschedule(false)
    setSelectedSlotId('')
    setSlots([])
    setDetailError(false)
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
          setDetailError(true)
        }
      } finally {
        if (!cancelled) setDetailLoading(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointmentId, retryTick])

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
      const followUpIso = followUpAt ? fromZonedTime(followUpAt, BUSINESS_TZ).toISOString() : ''
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

  const priority: CommercialPriority = appt?.commercialPriority ?? 'normal'
  const isVideo = appt?.appointmentType === 'video_engagement_rings'

  // Filas de la ficha de detalle (referencia). No incluye Estado ni Prioridad:
  // ya se muestran de forma prominente en el encabezado.
  const detailRows: [string, string][] = appt ? [
    ['Código',    appt.confirmationCode],
    ['Tipo',      appointmentTypeLabels[appt.appointmentType ?? 'showroom']],
    ['Nombre',    appt.name],
    ['Email',     appt.email],
    ['Teléfono',  appt.phone],
    ['Fecha',     formatShortDate(appt.slotDatetime)],
    ...(appt.productType ? [['Producto', appt.productType] as [string, string]] : []),
    ...(appt.budgetRange ? [['Presupuesto', appt.budgetRange] as [string, string]] : []),
    ...(appt.lookingFor ? [['Busca', appt.lookingFor] as [string, string]] : []),
    ...engagementBriefRows(appt.engagementBrief),
    ...(appt.meetingUrl ? [['Link videollamada', appt.meetingUrl] as [string, string]] : []),
    ...(appt.meetingInstructions ? [['Instrucciones video', appt.meetingInstructions] as [string, string]] : []),
    ['Seguimiento', appt.commercialStatus ? commercialStatusLabels[appt.commercialStatus] : 'Pendiente'],
    ...(appt.followUpAt ? [['Follow-up', formatShortDate(appt.followUpAt)] as [string, string]] : []),
    ['Calendar',  appt.googleCalendarEventId
      ? 'Sincronizado'
      : appt.calendarSyncFailed
        ? 'Error de sincronización'
        : 'Pendiente'],
    ...(appt.decidedBy ? [['Aprobado por', appt.decidedBy] as [string, string]] : []),
    ...(appt.decidedAt ? [['Fecha decisión', formatShortDate(appt.decidedAt)] as [string, string]] : []),
    ...(appt.status === 'accepted'
      ? [['Confirmación cliente', appt.clientConfirmed
          ? (appt.clientConfirmedAt ? `Sí · ${formatShortDate(appt.clientConfirmedAt)}` : 'Sí')
          : 'Pendiente'] as [string, string]]
      : []),
    ...(appt.adminNote ? [['Nota admin', appt.adminNote] as [string, string]] : []),
    ...(appt.notes ? [['Notas cliente', appt.notes] as [string, string]] : []),
    ...(appt.internalNote ? [['Notas internas', appt.internalNote] as [string, string]] : []),
  ] : []

  return (
    <Modal
      open={!!appointmentId}
      onClose={onClose}
      title="Detalle de cita"
      size="lg"
    >
      {detailError && !appt ? (
        <EmptyState
          icon={<AlertTriangle size={28} strokeWidth={1.5} />}
          title="No se pudo cargar la cita"
          description="Revisa tu conexión e inténtalo de nuevo."
          action={{ label: 'Reintentar', onClick: () => { setDetailError(false); setRetryTick(t => t + 1) } }}
        />
      ) : !appt ? (
        <div className="space-y-4" aria-busy="true" aria-label="Cargando cita">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2.5">
              <Skeleton className="h-3 w-20 rounded-lg" />
              <Skeleton className="h-8 w-48 rounded-lg" />
            </div>
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* ── Encabezado: identidad + estado de un vistazo ── */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="h-eyebrow mb-1">Solicitud</p>
              <h3 className="font-serif text-2xl font-light leading-tight text-ink">{appt.name}</h3>
              <p className="mt-1.5 text-xs text-ink-muted">
                {[appt.confirmationCode, appointmentTypeLabels[appt.appointmentType ?? 'showroom'], formatShortDate(appt.slotDatetime)].join(' · ')}
              </p>
              {detailLoading && (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-subtle">
                  <Loader2 size={11} className="animate-spin" /> Actualizando historial…
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <StatusBadge status={appt.status} />
              <Badge className={cn('border', priorityClass[priority])}>
                {priorityLabelLong[priority]}
              </Badge>
            </div>
          </div>

          {/* ── Aviso: sincronización de calendario fallida ── */}
          {appt.calendarSyncFailed && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
              <AlertTriangle size={14} strokeWidth={1.5} className="mt-px shrink-0" />
              <p>La cita quedó confirmada, pero Google Calendar no pudo crear el evento. Revisa diagnósticos y vuelve a intentarlo manualmente si hace falta.</p>
            </div>
          )}

          {/* ── Zona de decisión (pendiente): la acción principal, arriba ── */}
          {appt.status === 'pending' && (
            <div className="space-y-3 rounded-2xl border border-champagne-soft bg-champagne-tint/40 p-4">
              <div>
                <p className="h-eyebrow mb-1">Decisión</p>
                <p className="text-xs text-ink-muted">Confirma o rechaza la solicitud. El cliente recibe el resultado por correo.</p>
              </div>
              <div>
                <label htmlFor={`${uid}-reject`} className="label-clean">Motivo de rechazo (opcional)</label>
                <Textarea
                  id={`${uid}-reject`}
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="Ej: Sin disponibilidad en esa fecha"
                  rows={2}
                  className="mt-1"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="gold" className="min-h-[44px] flex-1" loading={deciding} onClick={() => void decide('accept')}>
                  <CheckCircle size={15} strokeWidth={1.5} /> Confirmar
                </Button>
                <Button variant="danger" className="min-h-[44px] flex-1" loading={deciding} onClick={() => void decide('reject')}>
                  <XCircle size={15} strokeWidth={1.5} /> Rechazar
                </Button>
              </div>
            </div>
          )}

          {/* ── Asistencia (confirmada): registro clave de operación ── */}
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
                  size="sm" className="min-h-[44px] flex-1" loading={deciding}
                  aria-pressed={appt.attended === true}
                  onClick={() => void markAttendance(true)}
                >
                  <CheckCircle size={14} strokeWidth={1.5} /> Asistió
                </Button>
                <Button
                  variant={appt.attended === false ? 'danger' : 'ghost'}
                  size="sm" className="min-h-[44px] flex-1" loading={deciding}
                  aria-pressed={appt.attended === false}
                  onClick={() => void markAttendance(false)}
                >
                  <XCircle size={14} strokeWidth={1.5} /> No asistió
                </Button>
              </div>
            </div>
          )}

          {/* ── Reagendar (confirmada) ── */}
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
                  className="min-h-[44px] w-full"
                  onClick={() => setShowReschedule(true)}
                >
                  <Calendar size={14} strokeWidth={1.5} /> Reagendar cita
                </Button>
              ) : (
                <div className="space-y-3">
                  <label htmlFor={`${uid}-slot`} className="block text-sm font-medium text-ink">Selecciona el nuevo horario</label>
                  {slotsLoading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 size={18} className="animate-spin text-champagne-solid" />
                    </div>
                  ) : slots.length === 0 ? (
                    <p className="py-3 text-center text-sm text-ink-muted">No hay horarios disponibles</p>
                  ) : (
                    <select
                      id={`${uid}-slot`}
                      value={selectedSlotId}
                      onChange={e => setSelectedSlotId(e.target.value)}
                      className="input-clean w-full"
                    >
                      <option value="">Elige un horario</option>
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
                      className="min-h-[44px] flex-1"
                      onClick={() => { setShowReschedule(false); setSelectedSlotId('') }}
                      disabled={rescheduling}
                    >
                      Cancelar
                    </Button>
                    <Button
                      variant="gold"
                      size="sm"
                      className="min-h-[44px] flex-1"
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

          {/* ── Seguimiento comercial (uso interno) ── */}
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
                  className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:shadow-focus-ring"
                >
                  <MessageCircle size={13} strokeWidth={1.5} />
                  WhatsApp
                </a>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={`${uid}-cstatus`} className="label-clean">Estado</label>
                <select
                  id={`${uid}-cstatus`}
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
                <label htmlFor={`${uid}-followup`} className="label-clean">Fecha de follow-up</label>
                <input
                  id={`${uid}-followup`}
                  type="datetime-local"
                  value={followUpAt}
                  onChange={e => setFollowUpAt(e.target.value)}
                  className="input-clean mt-1"
                />
              </div>
            </div>
            <div className="mt-3">
              <label htmlFor={`${uid}-note`} className="label-clean">Notas internas</label>
              <Textarea
                id={`${uid}-note`}
                value={internalNote}
                onChange={e => setInternalNote(e.target.value)}
                placeholder="Preparación, resultado, siguiente paso o contexto comercial."
                rows={3}
                className="mt-1"
              />
            </div>
            {isVideo && (
              <div className="mt-4 border-t border-admin-line pt-4">
                <p className="h-eyebrow mb-3">Videollamada</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor={`${uid}-provider`} className="label-clean">Proveedor</label>
                    <input
                      id={`${uid}-provider`}
                      value={meetingProvider}
                      onChange={e => setMeetingProvider(e.target.value)}
                      placeholder="Google Meet, Zoom..."
                      className="input-clean mt-1"
                    />
                  </div>
                  <div>
                    <label htmlFor={`${uid}-link`} className="label-clean">Link</label>
                    <input
                      id={`${uid}-link`}
                      value={meetingUrl}
                      onChange={e => setMeetingUrl(e.target.value)}
                      placeholder="https://meet.google.com/..."
                      className="input-clean mt-1"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label htmlFor={`${uid}-instr`} className="label-clean">Instrucciones</label>
                  <Textarea
                    id={`${uid}-instr`}
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
            <Button size="sm" className="mt-4" loading={savingCommercial} onClick={() => void saveCommercial()}>
              <Save size={14} strokeWidth={1.5} />
              Guardar seguimiento
            </Button>
          </div>

          {/* ── Detalles de la solicitud (referencia) ── */}
          <div className="rounded-2xl border border-admin-line bg-admin-surface/60 px-4">
            <p className="h-eyebrow pt-4">Detalles de la solicitud</p>
            <dl className="mt-1 divide-y divide-admin-line text-sm">
              {detailRows.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 py-2.5">
                  <dt className="shrink-0 text-ink-muted">{label}</dt>
                  <dd className="break-words text-right text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* ── Documento / consulta por video ── */}
          {!isVideo ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-admin-line bg-admin-surface px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <FileText size={16} strokeWidth={1.5} className="shrink-0 text-champagne-solid" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">Identificación titular</p>
                  <p className="truncate text-xs text-ink-muted">
                    {appt.identificationUrl ? 'Archivo protegido' : 'Sin archivo'}
                  </p>
                </div>
              </div>
              {appt.identificationUrl && (
                <a
                  href={`/api/admin/id-url?path=${encodeURIComponent(appt.identificationUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-champagne px-3 py-1.5 text-xs font-medium text-champagne-solid transition-colors hover:bg-champagne-soft focus-visible:outline-none focus-visible:shadow-focus-ring"
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

          {/* ── Reenviar email de estado ── */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-admin-line bg-admin-surface px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <Mail size={16} strokeWidth={1.5} className="shrink-0 text-champagne-solid" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">Email de estado</p>
                <p className="truncate text-xs text-ink-muted">Reenvía al cliente el correo según el estado actual.</p>
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

          {/* ── Invitados ── */}
          {!isVideo && (appt.guestCount ?? 0) > 0 && (
            <div className="pt-1">
              <p className="h-eyebrow mb-2">Invitados ({appt.guestCount})</p>
              <GuestsList appointmentId={appt.id} />
            </div>
          )}

          {/* ── Historiales (referencia, plegados para no saturar iPhone) ── */}
          {appt.customerHistory && appt.customerHistory.length > 0 && (
            <Disclosure title="Historial cliente" count={appt.customerHistory.length}>
              <div className="divide-y divide-admin-line rounded-xl border border-admin-line bg-admin-panel">
                {appt.customerHistory.map(item => (
                  <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{item.slotDatetime ? formatShortDate(item.slotDatetime) : 'Sin fecha'}</p>
                      <p className="truncate text-ink-muted">{[item.productType, item.budgetRange].filter(Boolean).join(' · ') || item.name}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <StatusBadge status={item.status} />
                      {item.commercialStatus && (
                        <p className="mt-1 text-[10px] text-ink-muted">{commercialStatusLabels[item.commercialStatus]}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Disclosure>
          )}

          {appt.eventHistory && appt.eventHistory.length > 0 && (
            <Disclosure title="Historial operativo" count={appt.eventHistory.length}>
              <div className="divide-y divide-admin-line rounded-xl border border-admin-line bg-admin-panel">
                {appt.eventHistory.map(event => (
                  <div key={event.id} className="px-3 py-2.5 text-xs">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium text-ink">{event.summary || event.action}</p>
                      {event.createdAt && <span className="shrink-0 text-ink-subtle">{formatShortDate(event.createdAt)}</span>}
                    </div>
                    <p className="mt-1 text-ink-muted">{event.actor || 'Sistema'}</p>
                  </div>
                ))}
              </div>
            </Disclosure>
          )}
        </div>
      )}
    </Modal>
  )
}
