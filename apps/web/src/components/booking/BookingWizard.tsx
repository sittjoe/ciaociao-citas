'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { CheckCircle2, ChevronLeft, ExternalLink, Send, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from '@/components/motion'
import { Card } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { CalendarView } from './CalendarView'
import { SlotPicker } from './SlotPicker'
import { IDUploader } from './IDUploader'
import { GuestsField } from './GuestsField'
import { Button } from '@/components/ui/Button'
import { bookingFormSchema, type BookingFormInput, type GuestInput } from '@/lib/schemas'
import { cn, formatDate, formatTime } from '@/lib/utils'

interface Slot { id: string; datetime: string }

type Step = 'calendar' | 'slots' | 'form' | 'upload' | 'review' | 'done'

const STEPS: Step[] = ['calendar', 'slots', 'form', 'upload', 'review', 'done']
const STEP_LABELS   = ['Fecha', 'Horario', 'Datos', 'Identificación', 'Confirmar', '']

const stepVariants = {
  initial: (dir: number) => ({ opacity: 0, x: dir * 36 }),
  animate: { opacity: 1, x: 0, transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
  exit:    (dir: number) => ({ opacity: 0, x: dir * -36, transition: { duration: 0.18 } }),
}

export function BookingWizard() {
  const [step,         setStep]        = useState<Step>('calendar')
  const [slots,        setSlots]       = useState<Slot[]>([])
  const [loadingSlots, setLoadingSlots]= useState(true)
  const [selectedDate, setSelectedDate]= useState<string | null>(null)
  const [selectedSlot, setSelectedSlot]= useState<Slot | null>(null)
  const [idFile,       setIdFile]      = useState<File | null>(null)
  const [guests,       setGuests]      = useState<GuestInput[]>([])
  const [submitting,   setSubmitting]  = useState(false)
  const [confirmCode,  setConfirmCode] = useState('')
  const direction = useRef<1 | -1>(1)

  const {
    register,
    handleSubmit,
    getValues,
    trigger,
    watch,
    formState: { errors },
  } = useForm<BookingFormInput>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: { whatsapp: false },
  })

  useEffect(() => {
    fetch('/api/slots')
      .then(r => r.json())
      .then((d: { slots: Slot[] }) => setSlots(d.slots ?? []))
      .catch(() => toast.error('Error al cargar horarios'))
      .finally(() => setLoadingSlots(false))
  }, [])

  const stepIndex = STEPS.indexOf(step)
  const canGoBack = stepIndex > 0 && step !== 'done'
  const hostEmail = watch('email') ?? ''

  const goTo = useCallback((next: Step) => {
    const nextIdx = STEPS.indexOf(next)
    direction.current = nextIdx > stepIndex ? 1 : -1
    setStep(next)
  }, [stepIndex])

  const goBack = useCallback(() => goTo(STEPS[stepIndex - 1]), [stepIndex, goTo])

  const onSubmit = useCallback(async (data: BookingFormInput) => {
    if (!selectedSlot) { toast.error('Selecciona un horario antes de continuar'); goTo('calendar'); return }
    if (!idFile)       { toast.error('Sube tu identificación antes de continuar'); goTo('upload'); return }
    setSubmitting(true)

    const fd = new FormData()
    fd.append('slotId',   selectedSlot.id)
    fd.append('name',     data.name)
    fd.append('email',    data.email)
    fd.append('phone',    data.phone)
    fd.append('notes',    data.notes ?? '')
    fd.append('whatsapp', String(data.whatsapp))
    fd.append('idFile',   idFile)
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
          : typeof json.error === 'string' ? json.error
          : `Error al enviar solicitud (${res.status})`
        toast.error(msg)
        if (res.status === 409) { goTo('calendar'); setSelectedSlot(null) }
        return
      }
      if (!json.confirmationCode) { toast.error('Respuesta inesperada del servidor'); return }
      setConfirmCode(json.confirmationCode)
      direction.current = 1
      setStep('done')
    } catch {
      toast.error('Error de conexión. Por favor intenta de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }, [selectedSlot, idFile, guests, goTo])

  return (
    <div className="w-full max-w-2xl mx-auto">
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
            {STEP_LABELS[stepIndex]}
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

      <AnimatePresence mode="wait" custom={direction.current}>
        <motion.div
          key={step}
          custom={direction.current}
          variants={stepVariants}
          initial="initial"
          animate="animate"
          exit="exit"
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
              ) : slots.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <p className="text-sm text-ink-muted leading-relaxed max-w-xs mx-auto">
                    En este momento no tenemos horarios disponibles. Te invitamos a regresar pronto o escribirnos a{' '}
                    <a href="mailto:hola@ciaociao.mx" className="text-champagne hover:underline">hola@ciaociao.mx</a>.
                  </p>
                </div>
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
                const formOk = await trigger(['name', 'email', 'phone', 'notes', 'whatsapp'])
                if (!formOk) {
                  toast.error('Completa tus datos antes de continuar')
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
                if (errs.name || errs.email || errs.phone || errs.notes) goTo('form')
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
                    ['Identificación', idFile?.name ?? ''],
                  ] as [string, string][]).map(([label, value]) => (
                    <div key={label} className="flex justify-between py-2.5 text-sm">
                      <span className="text-ink-muted">{label}</span>
                      <span className="text-ink text-right max-w-[60%] truncate">{value}</span>
                    </div>
                  ))}
                  {guests.length > 0 && (
                    <div className="py-2.5 text-sm">
                      <p className="text-ink-muted mb-1.5">Invitados ({guests.length})</p>
                      {guests.map((g, i) => (
                        <p key={i} className="text-ink text-right truncate">· {g.name} — {g.email}</p>
                      ))}
                    </div>
                  )}
                </div>

                <p className="text-xs text-ink-muted leading-relaxed">
                  Al confirmar, tu solicitud será revisada por nuestro equipo y recibirás un email con la confirmación o actualización.
                </p>

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
                  Revisaremos tu solicitud y te notificaremos a la brevedad por email.
                </p>
              </div>

              <div className="bg-vellum border border-ink-line rounded-2xl py-5 px-8 inline-block mx-auto">
                <p className="h-eyebrow mb-2">Código de referencia</p>
                <p className="font-mono text-3xl font-bold text-champagne tracking-[0.18em]">{confirmCode}</p>
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
      </AnimatePresence>
    </div>
  )
}
