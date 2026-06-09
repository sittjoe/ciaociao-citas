'use client'

import { useState, useEffect, useCallback, useRef, type FormEvent } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { AlertTriangle, CheckCircle2, ChevronLeft, ExternalLink, Send, ShieldCheck, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { motion } from '@/components/motion'
import { Card } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { CalendarView } from './CalendarView'
import { SlotPicker } from './SlotPicker'
import { IDUploader } from './IDUploader'
import { GuestsField } from './GuestsField'
import { Button } from '@/components/ui/Button'
import {
  bookingFormSchema,
  budgetRangeOptions,
  productTypeOptions,
  type BookingFormInput,
  type GuestInput,
} from '@/lib/schemas'
import { cn, formatDate, formatTime } from '@/lib/utils'

interface Slot { id: string; datetime: string }

type Step = 'calendar' | 'slots' | 'form' | 'upload' | 'review' | 'done'
interface BookingDraft {
  savedAt: number
  step: Step
  selectedDate: string | null
  selectedSlotId: string | null
  values: Partial<BookingFormInput>
  guests: GuestInput[]
  idempotencyKey: string
}

const STEPS: Step[] = ['calendar', 'slots', 'form', 'upload', 'review', 'done']
const STEP_LABELS   = ['Fecha', 'Horario', 'Datos', 'Identificación', 'Confirmar', '']
const DRAFT_KEY = 'ciaociao-booking-draft-v1'
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000
const SUPPORT_EMAIL = 'hola@ciaociao.mx'

const stepVariants = {
  initial: (dir: number) => ({ opacity: 0, x: dir * 36 }),
  animate: { opacity: 1, x: 0, transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
  exit:    (dir: number) => ({ opacity: 0, x: dir * -36, transition: { duration: 0.18 } }),
}

export function BookingWizard() {
  const [step,         setStep]        = useState<Step>('calendar')
  const [slots,        setSlots]       = useState<Slot[]>([])
  const [loadingSlots, setLoadingSlots]= useState(true)
  const [slotsError,   setSlotsError]  = useState(false)
  const [selectedDate, setSelectedDate]= useState<string | null>(null)
  const [selectedSlot, setSelectedSlot]= useState<Slot | null>(null)
  const [idFile,       setIdFile]      = useState<File | null>(null)
  const [guests,       setGuests]      = useState<GuestInput[]>([])
  const [submitting,   setSubmitting]  = useState(false)
  const [confirmCode,  setConfirmCode] = useState('')
  const [submitNotice, setSubmitNotice]= useState<string | null>(null)
  const [needsIdAgain, setNeedsIdAgain]= useState(false)
  const [draftRestored, setDraftRestored] = useState(false)
  const direction = useRef<1 | -1>(1)
  const submitInFlight = useRef(false)
  const restoredSlotId = useRef<string | null>(null)
  const didRestoreDraft = useRef(false)
  const idempotencyKey = useRef<string>(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
  )

  const {
    register,
    handleSubmit,
    getValues,
    trigger,
    watch,
    setFocus,
    reset,
    formState: { errors },
  } = useForm<BookingFormInput>({
    resolver: zodResolver(bookingFormSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: { whatsapp: false },
  })

  const loadSlots = useCallback(async () => {
    setLoadingSlots(true)
    setSlotsError(false)
    try {
      const res = await fetch('/api/slots')
      if (!res.ok) throw new Error('SLOTS_FAILED')
      const d = await res.json() as { slots?: Slot[] }
      setSlots(d.slots ?? [])
    } catch {
      setSlots([])
      setSlotsError(true)
      toast.error('Error al cargar horarios')
    } finally {
      setLoadingSlots(false)
    }
  }, [])

  useEffect(() => {
    void loadSlots()
  }, [loadSlots])

  useEffect(() => {
    if (didRestoreDraft.current) return
    didRestoreDraft.current = true
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const draft = JSON.parse(raw) as BookingDraft
      if (!draft.savedAt || Date.now() - draft.savedAt > DRAFT_TTL_MS) {
        localStorage.removeItem(DRAFT_KEY)
        return
      }
      reset({
        name: draft.values.name ?? '',
        email: draft.values.email ?? '',
        phone: draft.values.phone ?? '',
        notes: draft.values.notes ?? '',
        productType: draft.values.productType ?? '',
        budgetRange: draft.values.budgetRange ?? '',
        lookingFor: draft.values.lookingFor ?? '',
        whatsapp: draft.values.whatsapp ?? false,
      })
      setDraftRestored(true)
      setGuests(draft.guests ?? [])
      setSelectedDate(draft.selectedDate)
      restoredSlotId.current = draft.selectedSlotId
      idempotencyKey.current = draft.idempotencyKey || idempotencyKey.current
      if (draft.step === 'upload' || draft.step === 'review') {
        setNeedsIdAgain(true)
        setStep('upload')
      } else if (draft.step !== 'done') {
        setStep(draft.step)
      }
    } catch {
      localStorage.removeItem(DRAFT_KEY)
    }
  }, [reset])

  useEffect(() => {
    if (!restoredSlotId.current || slots.length === 0) return
    const restored = slots.find(slot => slot.id === restoredSlotId.current)
    if (restored) setSelectedSlot(restored)
    restoredSlotId.current = null
  }, [slots])

  const stepIndex = STEPS.indexOf(step)
  const canGoBack = stepIndex > 0 && step !== 'done'
  const hostEmail = watch('email') ?? ''
  const watchedValues = watch()

  useEffect(() => {
    if (step === 'done') return
    const draft: BookingDraft = {
      savedAt: Date.now(),
      step,
      selectedDate,
      selectedSlotId: selectedSlot?.id ?? null,
      values: watchedValues,
      guests,
      idempotencyKey: idempotencyKey.current,
    }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  }, [step, selectedDate, selectedSlot?.id, watchedValues, guests])

  const goTo = useCallback((next: Step) => {
    const nextIdx = STEPS.indexOf(next)
    direction.current = nextIdx > stepIndex ? 1 : -1
    setStep(next)
  }, [stepIndex])

  const goBack = useCallback(() => goTo(STEPS[stepIndex - 1]), [stepIndex, goTo])

  const onSubmit = useCallback(async (data: BookingFormInput) => {
    if (submitInFlight.current) return
    if (!selectedSlot) { toast.error('Selecciona un horario antes de continuar'); goTo('calendar'); return }
    if (!idFile)       { toast.error('Sube tu identificación antes de continuar'); goTo('upload'); return }
    submitInFlight.current = true
    setSubmitNotice(null)
    setSubmitting(true)

    const fd = new FormData()
    fd.append('slotId',   selectedSlot.id)
    fd.append('name',     data.name)
    fd.append('email',    data.email)
    fd.append('phone',    data.phone)
    fd.append('notes',    data.notes ?? '')
    fd.append('productType', data.productType ?? '')
    fd.append('budgetRange', data.budgetRange ?? '')
    fd.append('lookingFor', data.lookingFor ?? '')
    fd.append('whatsapp', String(data.whatsapp))
    fd.append('idFile',   idFile)
    fd.append('idempotencyKey', idempotencyKey.current)
    if (guests.length > 0) {
      fd.append('guests', JSON.stringify(
        guests.map(g => ({ name: g.name.trim(), email: g.email.trim().toLowerCase() }))
      ))
    }

    try {
      const res  = await fetch('/api/booking', { method: 'POST', body: fd })
      const text = await res.text()
      let json: { confirmationCode?: string; error?: unknown } = {}
      try { json = text ? JSON.parse(text) : {} } catch { /* non-JSON */ }

      if (!res.ok) {
        const msg = res.status === 409
          ? 'Este horario ya fue tomado. Por favor selecciona otro.'
          : res.status === 429
          ? 'Recibimos demasiados intentos. Tus datos siguen guardados; intenta otra vez en una hora.'
          : typeof json.error === 'string' ? json.error
          : `Error al enviar solicitud (${res.status})`
        toast.error(msg)
        setSubmitNotice(msg)
        if (res.status === 409) { goTo('calendar'); setSelectedSlot(null) }
        return
      }
      if (!json.confirmationCode) { toast.error('Respuesta inesperada del servidor'); return }
      setConfirmCode(json.confirmationCode)
      localStorage.removeItem(DRAFT_KEY)
      idempotencyKey.current = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
      direction.current = 1
      setStep('done')
    } catch {
      const msg = 'No se pudo enviar. Tus datos siguen guardados en este dispositivo.'
      toast.error(msg)
      setSubmitNotice(msg)
    } finally {
      submitInFlight.current = false
      setSubmitting(false)
    }
  }, [selectedSlot, idFile, guests, goTo])

  return (
    <div className="w-full max-w-2xl mx-auto">
      {draftRestored && step !== 'done' && (
        <div className="mb-4 rounded-xl border border-champagne-soft bg-champagne-tint px-4 py-3 text-sm text-champagne-deep">
          Recuperamos tu avance guardado en este dispositivo. Puedes continuar donde te quedaste.
        </div>
      )}

      {/* Progress bar */}
      {step !== 'done' && (
        <div className="mb-6">
          <div className="mb-3 hidden grid-cols-5 gap-2 sm:grid">
            {STEPS.slice(0, -1).map((s, i) => (
              <button
                key={s}
                type="button"
                onClick={() => i < stepIndex && goTo(s)}
                disabled={i > stepIndex}
                aria-current={i === stepIndex ? 'step' : undefined}
                className={cn(
                  'rounded-xl border px-3 py-2 text-left transition-colors',
                  i < stepIndex && 'border-champagne-soft bg-champagne-tint text-champagne-deep',
                  i === stepIndex && 'border-champagne bg-porcelain text-ink shadow-soft',
                  i > stepIndex && 'border-ink-line bg-porcelain/70 text-ink-subtle',
                )}
              >
                <span className="block text-[0.62rem] font-semibold uppercase tracking-eyebrow">{i + 1}</span>
                <span className="block truncate text-xs font-medium">{STEP_LABELS[i]}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 mb-2 sm:hidden">
            {STEPS.slice(0, -1).map((s, i) => (
              <div
                key={s}
                className={cn(
                  'h-0.5 flex-1 rounded-full transition-all duration-500',
                  i < stepIndex     ? 'bg-champagne'
                  : i === stepIndex ? 'bg-champagne/40'
                  :                   'bg-ink-line',
                )}
              />
            ))}
          </div>
          <p className="text-[0.6rem] text-ink-muted text-right tracking-widest uppercase font-semibold">
            Paso {Math.min(stepIndex + 1, 5)} de 5 · {STEP_LABELS[stepIndex]}
          </p>
        </div>
      )}

      {/* Back button */}
      {canGoBack && (
        <button
          onClick={goBack}
          className="flex items-center gap-1 text-ink-muted hover:text-ink text-sm mb-4 transition-colors duration-150"
        >
          <ChevronLeft size={16} strokeWidth={1.5} /> Volver
        </button>
      )}

      <motion.div
        key={step}
        custom={direction.current}
        variants={stepVariants}
        initial="initial"
        animate="animate"
      >
          {/* STEP: Calendar */}
          {step === 'calendar' && (
            <Card variant="atelier" className="p-5 sm:p-7">
              <div className="mb-5 flex items-end justify-between gap-4">
                <div>
                  <p className="h-eyebrow mb-2">Paso 1</p>
                  <h2 className="font-serif font-light text-2xl text-ink">Selecciona una fecha</h2>
                </div>
                <span className="hidden text-xs text-ink-muted sm:block">Horarios CDMX</span>
              </div>
              {loadingSlots ? (
                <div className="h-64 shimmer rounded-xl" />
              ) : slotsError ? (
                <div className="text-center py-12 px-4" role="alert">
                  <p className="text-sm text-ink-muted leading-relaxed max-w-xs mx-auto">
                    No pudimos cargar los horarios. Intenta de nuevo en un momento.
                  </p>
                  <Button type="button" variant="outline" className="mt-5" onClick={() => void loadSlots()}>
                    Reintentar
                  </Button>
                </div>
              ) : slots.length === 0 ? (
                <WaitlistForm />
              ) : (
                <CalendarView
                  slots={slots}
                  selectedDate={selectedDate}
                  onSelectDate={date => {
                    setSelectedDate(date)
                    setSelectedSlot(null)
                    goTo('slots')
                  }}
                />
              )}
            </Card>
          )}

          {/* STEP: Slot picker */}
          {step === 'slots' && selectedDate && (
            <Card variant="atelier" className="space-y-5 p-5 sm:p-7">
              <div>
                <p className="h-eyebrow mb-2">Paso 2</p>
                <h2 className="font-serif font-light text-2xl text-ink capitalize">
                  {format(parseISO(selectedDate), "EEEE d 'de' MMMM", { locale: es })}
                </h2>
              </div>
              <SlotPicker
                slots={slots}
                selectedDate={selectedDate}
                selectedSlotId={selectedSlot?.id ?? null}
                onSelectSlot={id => setSelectedSlot(slots.find(s => s.id === id) ?? null)}
              />
              {selectedSlot && (
                <Button className="w-full" onClick={() => goTo('form')}>Continuar</Button>
              )}
            </Card>
          )}

          {/* STEP: Contact form */}
          {step === 'form' && (
            <form
              className="space-y-4"
              onSubmit={async e => {
                e.preventDefault()
                const formOk = await trigger(['name', 'email', 'phone', 'notes', 'productType', 'budgetRange', 'lookingFor', 'whatsapp'])
                if (!formOk) {
                  toast.error('Completa tus datos antes de continuar')
                  if (errors.name) setFocus('name')
                  else if (errors.email) setFocus('email')
                  else if (errors.phone) setFocus('phone')
                  return
                }
                if (guests.length > 0) {
                  const emails    = guests.map(g => g.email.trim().toLowerCase())
                  const hostEmail = getValues('email').trim().toLowerCase()
                  if (guests.some(g => !g.name.trim() || !g.email.trim())) {
                    toast.error('Completa el nombre y email de todos los invitados')
                    return
                  }
                  if (new Set(emails).size < emails.length) {
                    toast.error('Hay emails duplicados entre los invitados')
                    return
                  }
                  if (emails.includes(hostEmail)) {
                    toast.error('Un invitado no puede tener el mismo email que el titular')
                    return
                  }
                }
                goTo('upload')
              }}
            >
              <Card variant="atelier" className="space-y-4 p-5 sm:p-7">
                <div>
                  <p className="h-eyebrow mb-2">Paso 3</p>
                  <h2 className="font-serif font-light text-2xl text-ink">Tus datos</h2>
                </div>

                <Field label="Nombre completo" required error={errors.name?.message}>
                  {(id, ariaProps) => (
                    <input
                      id={id}
                      {...ariaProps}
                      {...register('name')}
                      className="input-clean"
                      placeholder="María García"
                      autoComplete="name"
                    />
                  )}
                </Field>

                <Field label="Email" required error={errors.email?.message}>
                  {(id, ariaProps) => (
                    <input
                      id={id}
                      {...ariaProps}
                      {...register('email')}
                      type="email"
                      className="input-clean"
                      placeholder="maria@ejemplo.com"
                      autoComplete="email"
                    />
                  )}
                </Field>

                <Field label="Teléfono" required error={errors.phone?.message}>
                  {(id, ariaProps) => (
                    <input
                      id={id}
                      {...ariaProps}
                      {...register('phone')}
                      type="tel"
                      className="input-clean"
                      placeholder="+52 55 1234 5678"
                      autoComplete="tel"
                    />
                  )}
                </Field>

                <Field label="Notas adicionales" error={errors.notes?.message}>
                  {(id, ariaProps) => (
                    <textarea
                      id={id}
                      {...ariaProps}
                      {...register('notes')}
                      className="input-clean resize-none"
                      rows={3}
                      placeholder="¿Hay algo que quieras contarnos antes de tu visita?"
                    />
                  )}
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Tipo de producto que buscas" error={errors.productType?.message}>
                    {(id, ariaProps) => (
                      <select
                        id={id}
                        {...ariaProps}
                        {...register('productType')}
                        className="input-clean"
                      >
                        <option value="">Seleccionar</option>
                        {productTypeOptions.map(option => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    )}
                  </Field>

                  <Field label="Presupuesto aproximado" error={errors.budgetRange?.message}>
                    {(id, ariaProps) => (
                      <select
                        id={id}
                        {...ariaProps}
                        {...register('budgetRange')}
                        className="input-clean"
                      >
                        <option value="">Seleccionar</option>
                        {budgetRangeOptions.map(option => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    )}
                  </Field>
                </div>

                <Field label="Cuéntanos qué estás buscando" error={errors.lookingFor?.message}>
                  {(id, ariaProps) => (
                    <textarea
                      id={id}
                      {...ariaProps}
                      {...register('lookingFor')}
                      className="input-clean resize-none"
                      rows={4}
                      placeholder="Ej. un anillo para aniversario, oro amarillo, algo discreto..."
                    />
                  )}
                </Field>

                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    {...register('whatsapp')}
                    type="checkbox"
                    className="w-4 h-4 rounded border-ink-line accent-champagne"
                  />
                  <span className="text-sm text-ink-muted">
                    Deseo recibir recordatorios por WhatsApp
                  </span>
                </label>

                <div className="border-t border-ink-line pt-4">
                  <GuestsField
                    value={guests}
                    onChange={setGuests}
                    hostEmail={hostEmail}
                  />
                </div>

                <Button type="submit" className="w-full">Continuar</Button>
              </Card>
            </form>
          )}

          {/* STEP: ID upload */}
          {step === 'upload' && (
            <Card variant="atelier" className="space-y-4 p-5 sm:p-7">
              <div>
                <p className="h-eyebrow mb-2">Paso 4</p>
                <h2 className="font-serif font-light text-2xl text-ink">Identificación oficial</h2>
                <p className="text-sm text-ink-muted mt-1">
                  Requerida para confirmar tu visita al showroom privado.
                </p>
              </div>
              <IDUploader value={idFile} onChange={setIdFile} />
              {needsIdAgain && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                  Recuperamos tu avance. Por seguridad, vuelve a subir tu identificación.
                </p>
              )}
              <Button className="w-full" disabled={!idFile} onClick={() => goTo('review')}>
                <ShieldCheck size={15} strokeWidth={1.5} /> Continuar
              </Button>
            </Card>
          )}

          {/* STEP: Review */}
          {step === 'review' && selectedSlot && (
            <form
              onSubmit={handleSubmit(onSubmit, errs => {
                const first = Object.values(errs)[0]?.message
                toast.error(first ?? 'Revisa los datos del formulario')
                if (errs.name || errs.email || errs.phone || errs.notes || errs.productType || errs.budgetRange || errs.lookingFor) {
                  goTo('form')
                  const field = errs.name ? 'name'
                    : errs.email ? 'email'
                    : errs.phone ? 'phone'
                    : errs.notes ? 'notes'
                    : errs.productType ? 'productType'
                    : errs.budgetRange ? 'budgetRange'
                    : 'lookingFor'
                  window.setTimeout(() => setFocus(field), 0)
                }
              })}
            >
              <Card variant="atelier" className="space-y-5 p-5 sm:p-7">
                <div>
                  <p className="h-eyebrow mb-2">Paso 5</p>
                  <h2 className="font-serif font-light text-2xl text-ink">Confirmar solicitud</h2>
                </div>

                <div className="divide-y divide-ink-line">
                  {([
                    ['Fecha',         formatDate(selectedSlot.datetime)],
                    ['Hora',          formatTime(selectedSlot.datetime)],
                    ['Nombre',        getValues('name')],
                    ['Email',         getValues('email')],
                    ['Teléfono',      getValues('phone')],
                    ...(getValues('notes') ? [['Notas', getValues('notes')!]] : []),
                    ...(getValues('productType') ? [['Producto', getValues('productType')!]] : []),
                    ...(getValues('budgetRange') ? [['Presupuesto', getValues('budgetRange')!]] : []),
                    ...(getValues('lookingFor') ? [['Busca', getValues('lookingFor')!]] : []),
                    ['Identificación', idFile?.name ?? ''],
                  ] as [string, string][]).map(([label, value]) => (
                    <div key={label} className="flex justify-between py-2.5 text-sm">
                      <span className="text-ink-muted">{label}</span>
                      <span className="text-ink text-right max-w-[60%] break-words">{value}</span>
                    </div>
                  ))}
                  {guests.length > 0 && (
                    <div className="py-2.5 text-sm">
                      <p className="text-ink-muted mb-1.5">Invitados ({guests.length})</p>
                      {guests.map((g, i) => (
                        <p key={i} className="text-ink text-right break-words">· {g.name} — {g.email}</p>
                      ))}
                    </div>
                  )}
                </div>

                {guests.length < 3 && (
                  <div className="rounded-xl border border-ink-line bg-cream-soft p-3.5">
                    <p className="text-xs text-ink leading-relaxed mb-2">
                      {guests.length === 0
                        ? '¿Vendrás acompañado? Aún puedes agregar invitados antes de confirmar.'
                        : `Tienes ${guests.length} invitado${guests.length > 1 ? 's' : ''}. ¿Deseas agregar ${3 - guests.length === 1 ? 'uno más' : 'más'}?`}
                    </p>
                    <button
                      type="button"
                      onClick={() => goTo('form')}
                      className="inline-flex items-center gap-1.5 text-xs text-champagne hover:text-champagne-deep font-medium transition-colors"
                    >
                      <UserPlus size={13} strokeWidth={1.5} />
                      {guests.length === 0 ? 'Agregar invitados' : 'Agregar otro invitado'}
                    </button>
                  </div>
                )}

                {guests.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 flex gap-2.5">
                    <AlertTriangle size={15} strokeWidth={1.5} className="text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-900 leading-relaxed">
                      Cada invitado recibirá un email para subir su identificación oficial.{' '}
                      <strong className="font-semibold">Los invitados que no completen la verificación no podrán ingresar al showroom.</strong>
                    </p>
                  </div>
                )}

                <p className="text-xs text-ink-muted leading-relaxed">
                  Al confirmar, tu solicitud será revisada por nuestro equipo y recibirás un email con la confirmación o actualización.
                </p>

                {submitNotice && (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800" role="alert">
                    {submitNotice}
                  </p>
                )}

                <Button type="submit" loading={submitting} className="w-full">
                  <Send size={15} strokeWidth={1.5} /> Enviar solicitud
                </Button>
              </Card>
            </form>
          )}

          {/* STEP: Done */}
          {step === 'done' && (
            <Card variant="atelier" className="text-center space-y-6 px-6 py-9">
              <div className="flex justify-center">
                <motion.div
                  initial={{ scale: 0.92, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
                  className="w-16 h-16 rounded-full bg-champagne-tint border border-champagne-soft flex items-center justify-center"
                >
                  <CheckCircle2 size={32} strokeWidth={1.5} className="text-champagne" />
                </motion.div>
              </div>

              <div className="space-y-2">
                <h2 className="font-serif font-light text-3xl text-ink">Solicitud recibida</h2>
                <p className="text-sm text-ink-muted leading-relaxed max-w-xs mx-auto">
                  Tu cita aún está pendiente de revisión. Te notificaremos a la brevedad por email.
                </p>
              </div>

              <div className="bg-vellum border border-ink-line rounded-2xl py-5 px-8 inline-block mx-auto">
                <p className="h-eyebrow mb-2">Código de referencia</p>
                <p className="font-mono text-2xl font-bold text-champagne tracking-[0.18em] sm:text-3xl">{confirmCode}</p>
              </div>

              <div className="space-y-2.5">
                <a
                  href={`/reserva/${confirmCode}`}
                  className="flex items-center justify-center gap-2 w-full py-2.5 px-5 rounded-xl
                             border border-champagne text-champagne text-sm font-medium
                             hover:bg-champagne-soft transition-colors duration-200"
                >
                  <ExternalLink size={15} strokeWidth={1.5} />
                  Ver estado de tu cita
                </a>
                <p className="text-xs text-ink-subtle">
                  También recibirás un email con esta información.
                </p>
              </div>
            </Card>
          )}
      </motion.div>
    </div>
  )
}

function WaitlistForm() {
  const [values, setValues] = useState({
    name: '',
    email: '',
    phone: '',
    productType: '',
    budgetRange: '',
    message: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: unknown }
        throw new Error(typeof json.error === 'string' ? json.error : 'No pudimos guardar tus datos')
      }
      setSent(true)
      toast.success('Te avisaremos cuando haya horarios disponibles')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar tus datos')
    } finally {
      setSubmitting(false)
    }
  }

  if (sent) {
    return (
      <div className="px-4 py-12 text-center">
        <CheckCircle2 size={30} strokeWidth={1.5} className="mx-auto text-champagne" />
        <h3 className="mt-4 font-serif text-2xl font-light text-ink">Quedaste en lista</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-ink-muted">
          Guardamos tus datos. En cuanto abramos nuevos horarios, el equipo podrá contactarte.
        </p>
        <a href={`mailto:${SUPPORT_EMAIL}`} className="mt-5 inline-flex text-sm font-medium text-champagne hover:underline">
          Tengo problema para reservar
        </a>
      </div>
    )
  }

  return (
    <form className="space-y-4 px-1 py-2" onSubmit={submit}>
      <div className="text-center">
        <h3 className="font-serif text-2xl font-light text-ink">Sin horarios disponibles</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-ink-muted">
          Déjanos tus datos y te avisamos cuando haya nuevos espacios para el showroom.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre completo" required>
          {(id, ariaProps) => (
            <input
              id={id}
              {...ariaProps}
              value={values.name}
              onChange={e => setValues(prev => ({ ...prev, name: e.target.value }))}
              className="input-clean"
              autoComplete="name"
              required
            />
          )}
        </Field>
        <Field label="Teléfono" required>
          {(id, ariaProps) => (
            <input
              id={id}
              {...ariaProps}
              value={values.phone}
              onChange={e => setValues(prev => ({ ...prev, phone: e.target.value }))}
              className="input-clean"
              autoComplete="tel"
              required
            />
          )}
        </Field>
      </div>

      <Field label="Email" required>
        {(id, ariaProps) => (
          <input
            id={id}
            {...ariaProps}
            value={values.email}
            onChange={e => setValues(prev => ({ ...prev, email: e.target.value }))}
            type="email"
            className="input-clean"
            autoComplete="email"
            required
          />
        )}
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Producto de interés">
          {(id, ariaProps) => (
            <select
              id={id}
              {...ariaProps}
              value={values.productType}
              onChange={e => setValues(prev => ({ ...prev, productType: e.target.value }))}
              className="input-clean"
            >
              <option value="">Seleccionar</option>
              {productTypeOptions.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          )}
        </Field>
        <Field label="Presupuesto aproximado">
          {(id, ariaProps) => (
            <select
              id={id}
              {...ariaProps}
              value={values.budgetRange}
              onChange={e => setValues(prev => ({ ...prev, budgetRange: e.target.value }))}
              className="input-clean"
            >
              <option value="">Seleccionar</option>
              {budgetRangeOptions.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          )}
        </Field>
      </div>

      <Field label="Mensaje">
        {(id, ariaProps) => (
          <textarea
            id={id}
            {...ariaProps}
            value={values.message}
            onChange={e => setValues(prev => ({ ...prev, message: e.target.value }))}
            className="input-clean resize-none"
            rows={3}
            placeholder="Horario ideal, tipo de pieza o cualquier detalle útil."
          />
        )}
      </Field>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" className="flex-1" loading={submitting}>
          Avisarme
        </Button>
        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=Ayuda%20para%20reservar`}
          className="inline-flex items-center justify-center rounded-xl border border-ink-line px-4 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:border-champagne hover:text-champagne"
        >
          Tengo problema para reservar
        </a>
      </div>
    </form>
  )
}
