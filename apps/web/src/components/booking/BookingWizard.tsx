'use client'

import { useState, useEffect, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { CheckCircle2, ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'
import { CalendarView } from './CalendarView'
import { SlotPicker } from './SlotPicker'
import { IDUploader } from './IDUploader'
import { GuestsField } from './GuestsField'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { bookingFormSchema, type BookingFormInput, type GuestInput } from '@/lib/schemas'
import { cn, formatDate, formatTime } from '@/lib/utils'

interface Slot { id: string; datetime: string }

type Step = 'calendar' | 'slots' | 'form' | 'upload' | 'review' | 'done'

const STEPS: Step[] = ['calendar', 'slots', 'form', 'upload', 'review', 'done']
const STEP_LABELS   = ['Fecha', 'Horario', 'Datos', 'Identificación', 'Confirmar', '']

export function BookingWizard() {
  const [step,         setStep]        = useState<Step>('calendar')
  const [slots,        setSlots]       = useState<Slot[]>([])
  const [loadingSlots, setLoadingSlots]= useState(true)
  const [selectedDate, setSelectedDate]= useState<Date | null>(null)
  const [selectedSlot, setSelectedSlot]= useState<Slot | null>(null)
  const [idFile,       setIdFile]      = useState<File | null>(null)
  const [guests,       setGuests]      = useState<GuestInput[]>([])
  const [submitting,   setSubmitting]  = useState(false)
  const [confirmCode,  setConfirmCode] = useState('')

  const {
    register,
    handleSubmit,
    getValues,
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
  const goBack    = useCallback(() => setStep(STEPS[stepIndex - 1]), [stepIndex])

  const onSubmit = useCallback(async (data: BookingFormInput) => {
    if (!selectedSlot) {
      toast.error('Selecciona un horario antes de continuar')
      setStep('calendar')
      return
    }
    if (!idFile) {
      toast.error('Sube tu identificación antes de continuar')
      setStep('upload')
      return
    }
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
      try { json = text ? JSON.parse(text) : {} } catch { /* respuesta no-JSON */ }

      if (!res.ok) {
        const msg = res.status === 409
          ? 'Este horario ya fue tomado. Por favor selecciona otro.'
          : typeof json.error === 'string' ? json.error
          : `Error al enviar solicitud (${res.status})`
        toast.error(msg)
        if (res.status === 409) { setStep('calendar'); setSelectedSlot(null) }
        return
      }

      if (!json.confirmationCode) {
        toast.error('Respuesta inesperada del servidor')
        return
      }
      setConfirmCode(json.confirmationCode)
      setStep('done')
    } catch {
      toast.error('Error de conexión. Por favor intenta de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }, [selectedSlot, idFile])

  return (
    <div className="w-full max-w-lg mx-auto">
      {/* Progress bar */}
      {step !== 'done' && (
        <div className="mb-6">
          <div className="flex items-center gap-1 mb-2">
            {STEPS.slice(0, -1).map((s, i) => (
              <div
                key={s}
                className={cn(
                  'h-0.5 flex-1 rounded-full transition-all duration-500',
                  i < stepIndex  ? 'bg-champagne'
                  : i === stepIndex ? 'bg-champagne/40'
                  : 'bg-stone-200',
                )}
              />
            ))}
          </div>
          <p className="text-[0.65rem] text-ink-muted text-right tracking-widest uppercase font-semibold">
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
          <ChevronLeft size={16} /> Volver
        </button>
      )}

      {/* STEP: Calendar */}
      {step === 'calendar' && (
        <div className="card-soft fade-up">
          <h2 className="font-serif text-xl text-ink mb-5">Selecciona una fecha</h2>
          {loadingSlots ? (
            <div className="h-64 shimmer rounded-xl" />
          ) : slots.length === 0 ? (
            <div className="text-center py-12 px-4">
              <p className="text-sm text-ink-muted leading-relaxed max-w-xs mx-auto">
                En este momento no tenemos horarios disponibles. Te invitamos a regresar pronto o escribirnos a{' '}
                <a href="mailto:hola@ciaociao.mx" className="text-champagne hover:underline">
                  hola@ciaociao.mx
                </a>
                .
              </p>
            </div>
          ) : (
            <CalendarView
              slots={slots}
              selectedDate={selectedDate}
              onSelectDate={date => {
                setSelectedDate(date)
                setSelectedSlot(null)
                setStep('slots')
              }}
            />
          )}
        </div>
      )}

      {/* STEP: Slot picker */}
      {step === 'slots' && selectedDate && (
        <div className="card-soft fade-up space-y-4">
          <h2 className="font-serif text-xl text-ink capitalize">
            {format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
          </h2>
          <SlotPicker
            slots={slots}
            selectedDate={selectedDate}
            selectedSlotId={selectedSlot?.id ?? null}
            onSelectSlot={id => {
              const slot = slots.find(s => s.id === id) ?? null
              setSelectedSlot(slot)
            }}
          />
          {selectedSlot && (
            <Button className="w-full" onClick={() => setStep('form')}>
              Continuar →
            </Button>
          )}
        </div>
      )}

      {/* STEP: Contact form */}
      {step === 'form' && (
        <form
          className="card-soft fade-up space-y-4"
          onSubmit={e => {
            e.preventDefault()
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
            setStep('upload')
          }}
        >
          <h2 className="font-serif text-xl text-ink">Tus datos</h2>

          <Field label="Nombre completo" required error={errors.name?.message}>
            <input
              {...register('name')}
              className="input-clean"
              placeholder="María García"
              autoComplete="name"
            />
          </Field>

          <Field label="Email" required error={errors.email?.message}>
            <input
              {...register('email')}
              type="email"
              className="input-clean"
              placeholder="maria@ejemplo.com"
              autoComplete="email"
            />
          </Field>

          <Field label="Teléfono" required error={errors.phone?.message}>
            <input
              {...register('phone')}
              type="tel"
              className="input-clean"
              placeholder="+52 55 1234 5678"
              autoComplete="tel"
            />
          </Field>

          <Field label="Notas adicionales" error={errors.notes?.message}>
            <textarea
              {...register('notes')}
              className="input-clean resize-none"
              rows={3}
              placeholder="¿Hay algo que quieras contarnos antes de tu visita?"
            />
          </Field>

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              {...register('whatsapp')}
              type="checkbox"
              className="w-4 h-4 rounded border-stone-300 accent-champagne"
            />
            <span className="text-sm text-ink-muted">
              Deseo recibir recordatorios por WhatsApp
            </span>
          </label>

          <div className="border-t border-stone-100 pt-4">
            <GuestsField
              value={guests}
              onChange={setGuests}
              hostEmail={getValues('email')}
            />
          </div>

          <Button type="submit" className="w-full">Continuar →</Button>
        </form>
      )}

      {/* STEP: ID upload */}
      {step === 'upload' && (
        <div className="card-soft fade-up space-y-4">
          <div>
            <h2 className="font-serif text-xl text-ink">Identificación oficial</h2>
            <p className="text-sm text-ink-muted mt-1">
              Requerida para confirmar tu visita al showroom privado.
            </p>
          </div>

          <IDUploader value={idFile} onChange={setIdFile} />

          <Button
            className="w-full"
            disabled={!idFile}
            onClick={() => setStep('review')}
          >
            Continuar →
          </Button>
        </div>
      )}

      {/* STEP: Review */}
      {step === 'review' && selectedSlot && (
        <form
          className="card-soft fade-up space-y-5"
          onSubmit={handleSubmit(onSubmit, errs => {
            const first = Object.values(errs)[0]?.message
            toast.error(first ?? 'Revisa los datos del formulario')
            if (errs.name || errs.email || errs.phone || errs.notes) setStep('form')
          })}
        >
          <h2 className="font-serif text-xl text-ink">Confirmar solicitud</h2>

          <div className="divide-y divide-stone-100">
            {[
              ['Fecha',      formatDate(selectedSlot.datetime)],
              ['Hora',       formatTime(selectedSlot.datetime)],
              ['Nombre',     getValues('name')],
              ['Email',      getValues('email')],
              ['Teléfono',   getValues('phone')],
              ...(getValues('notes') ? [['Notas', getValues('notes')!]] : []),
              ['Identificación', idFile?.name ?? ''],
            ].map(([label, value]) => (
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
            Enviar solicitud
          </Button>
        </form>
      )}

      {/* STEP: Done */}
      {step === 'done' && (
        <div className="card-soft fade-up text-center space-y-4">
          <div className="flex justify-center">
            <CheckCircle2 size={48} className="text-champagne" />
          </div>
          <h2 className="font-serif text-2xl text-ink">¡Solicitud recibida!</h2>
          <p className="text-sm text-ink-muted leading-relaxed">
            Revisaremos tu solicitud y te notificaremos a la brevedad por email. Guarda tu código de referencia:
          </p>
          <div className="bg-cream-soft border border-stone-100 rounded-xl py-4 px-6 inline-block mx-auto">
            <p className="text-[0.65rem] text-ink-muted tracking-widest uppercase mb-1 font-semibold">Código</p>
            <p className="font-mono text-2xl font-bold text-champagne tracking-widest">{confirmCode}</p>
          </div>
          <p className="text-xs text-ink-muted">
            También puedes ver el estado en{' '}
            <a href={`/reserva/${confirmCode}`} className="text-champagne hover:underline">
              /reserva/{confirmCode}
            </a>
          </p>
        </div>
      )}
    </div>
  )
}
