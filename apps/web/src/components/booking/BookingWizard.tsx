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
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { bookingSchema, type BookingInput } from '@/lib/schemas'
import { cn, formatDate, formatTime } from '@/lib/utils'

interface Slot { id: string; datetime: string }

type Step = 'calendar' | 'slots' | 'form' | 'upload' | 'review' | 'done'

const STEPS: Step[] = ['calendar', 'slots', 'form', 'upload', 'review', 'done']
const STEP_LABELS   = ['Fecha', 'Horario', 'Datos', 'Identificación', 'Confirmar', '']

export function BookingWizard() {
  const [step,        setStep]        = useState<Step>('calendar')
  const [slots,       setSlots]       = useState<Slot[]>([])
  const [loadingSlots,setLoadingSlots]= useState(true)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [idFile,      setIdFile]      = useState<File | null>(null)
  const [submitting,  setSubmitting]  = useState(false)
  const [confirmCode, setConfirmCode] = useState('')

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<BookingInput>({
    resolver: zodResolver(bookingSchema),
    defaultValues: { whatsapp: false },
  })

  useEffect(() => {
    fetch('/api/slots')
      .then(r => r.json())
      .then((d: { slots: Slot[] }) => setSlots(d.slots ?? []))
      .catch(() => toast.error('Error al cargar horarios'))
      .finally(() => setLoadingSlots(false))
  }, [])

  const stepIndex    = STEPS.indexOf(step)
  const canGoBack    = stepIndex > 0 && step !== 'done'
  const goBack       = useCallback(() => setStep(STEPS[stepIndex - 1]), [stepIndex])

  const onSubmit = useCallback(async (data: BookingInput) => {
    if (!selectedSlot || !idFile) return
    setSubmitting(true)

    const fd = new FormData()
    fd.append('slotId',   selectedSlot.id)
    fd.append('name',     data.name)
    fd.append('email',    data.email)
    fd.append('phone',    data.phone)
    fd.append('notes',    data.notes ?? '')
    fd.append('whatsapp', String(data.whatsapp))
    fd.append('idFile',   idFile)

    try {
      const res  = await fetch('/api/booking', { method: 'POST', body: fd })
      const json = await res.json() as { confirmationCode?: string; error?: unknown }

      if (!res.ok) {
        const msg = res.status === 409
          ? 'Este horario ya fue tomado. Por favor selecciona otro.'
          : typeof json.error === 'string' ? json.error : 'Error al enviar solicitud'
        toast.error(msg)
        if (res.status === 409) { setStep('calendar'); setSelectedSlot(null) }
        return
      }

      setConfirmCode(json.confirmationCode ?? '')
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
                  'h-0.5 flex-1 rounded-full transition-all duration-300',
                  i < stepIndex ? 'bg-gold-500' : i === stepIndex ? 'bg-gold-700' : 'bg-rich-muted',
                )}
              />
            ))}
          </div>
          <p className="text-xs text-gold-700 text-right tracking-widest uppercase">
            {STEP_LABELS[stepIndex]}
          </p>
        </div>
      )}

      {/* Back button */}
      {canGoBack && (
        <button
          onClick={goBack}
          className="flex items-center gap-1 text-gold-700 hover:text-gold-400 text-sm mb-4 transition-colors"
        >
          <ChevronLeft size={16} /> Volver
        </button>
      )}

      {/* STEP: Calendar */}
      {step === 'calendar' && (
        <div className="card-luxury fade-up">
          <h2 className="font-serif text-xl text-gold-400 mb-5">Selecciona una fecha</h2>
          {loadingSlots ? (
            <div className="h-64 shimmer rounded-xl" />
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
        <div className="card-luxury fade-up space-y-4">
          <h2 className="font-serif text-xl text-gold-400">
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
          className="card-luxury fade-up space-y-4"
          onSubmit={e => { e.preventDefault(); setStep('upload') }}
        >
          <h2 className="font-serif text-xl text-gold-400">Tus datos</h2>

          <Field label="Nombre completo" required error={errors.name?.message}>
            <input
              {...register('name')}
              className="input-luxury"
              placeholder="María García"
              autoComplete="name"
            />
          </Field>

          <Field label="Email" required error={errors.email?.message}>
            <input
              {...register('email')}
              type="email"
              className="input-luxury"
              placeholder="maria@ejemplo.com"
              autoComplete="email"
            />
          </Field>

          <Field label="Teléfono" required error={errors.phone?.message}>
            <input
              {...register('phone')}
              type="tel"
              className="input-luxury"
              placeholder="+52 55 1234 5678"
              autoComplete="tel"
            />
          </Field>

          <Field label="Notas adicionales" error={errors.notes?.message}>
            <textarea
              {...register('notes')}
              className="input-luxury resize-none"
              rows={3}
              placeholder="¿Hay algo que quieras contarnos antes de tu visita?"
            />
          </Field>

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              {...register('whatsapp')}
              type="checkbox"
              className="w-4 h-4 rounded border-rich-subtle bg-rich-muted accent-gold-500"
            />
            <span className="text-sm text-gold-light">
              Deseo recibir recordatorios por WhatsApp
            </span>
          </label>

          <Button type="submit" className="w-full">Continuar →</Button>
        </form>
      )}

      {/* STEP: ID upload */}
      {step === 'upload' && (
        <div className="card-luxury fade-up space-y-4">
          <div>
            <h2 className="font-serif text-xl text-gold-400">Identificación oficial</h2>
            <p className="text-sm text-gold-700 mt-1">
              Requerida para confirmar tu visita al showroom privado.
            </p>
          </div>

          <IDUploader
            value={idFile}
            onChange={setIdFile}
          />

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
        <form className="card-luxury fade-up space-y-5" onSubmit={handleSubmit(onSubmit)}>
          <h2 className="font-serif text-xl text-gold-400">Confirmar solicitud</h2>

          <div className="divide-y divide-rich-muted">
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
                <span className="text-gold-700">{label}</span>
                <span className="text-gold-light text-right max-w-[60%] truncate">{value}</span>
              </div>
            ))}
          </div>

          <p className="text-xs text-gold-700 leading-relaxed">
            Al confirmar, tu solicitud será revisada por nuestro equipo y recibirás un email con la confirmación o actualización.
          </p>

          <Button type="submit" loading={submitting} className="w-full">
            Enviar solicitud
          </Button>
        </form>
      )}

      {/* STEP: Done */}
      {step === 'done' && (
        <div className="card-luxury fade-up text-center space-y-4">
          <div className="flex justify-center">
            <CheckCircle2 size={48} className="text-gold-400" />
          </div>
          <h2 className="font-serif text-2xl text-gold-400">¡Solicitud recibida!</h2>
          <p className="text-sm text-gold-700 leading-relaxed">
            Revisaremos tu solicitud y te notificaremos a la brevedad por email. Guarda tu código de referencia:
          </p>
          <div className="bg-rich-muted border border-rich-subtle rounded-xl py-4 px-6 inline-block mx-auto">
            <p className="text-xs text-gold-700 tracking-widest uppercase mb-1">Código</p>
            <p className="font-mono text-2xl font-bold text-gold-400 tracking-widest">{confirmCode}</p>
          </div>
          <p className="text-xs text-gold-700">
            También puedes ver el estado en{' '}
            <a
              href={`/reserva/${confirmCode}`}
              className="text-gold-400 hover:underline"
            >
              /reserva/{confirmCode}
            </a>
          </p>
        </div>
      )}
    </div>
  )
}
