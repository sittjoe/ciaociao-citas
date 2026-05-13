'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CalendarClock, XOctagon, X as CloseIcon, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface Props {
  code: string
  canReschedule: boolean
  canCancel: boolean
  initialReschedulePending?: boolean
  initialCancelPending?: boolean
}

type Mode = 'reschedule' | 'cancel'

export default function ClientRequestButtons({
  code,
  canReschedule,
  canCancel,
  initialReschedulePending = false,
  initialCancelPending = false,
}: Props) {
  const [mode, setMode]       = useState<Mode | null>(null)
  const [loading, setLoading] = useState(false)
  const [reason, setReason]   = useState('')
  const [reschedulePending, setReschedulePending] = useState(initialReschedulePending)
  const [cancelPending, setCancelPending]         = useState(initialCancelPending)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!mode) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMode(null) }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [mode])

  const submit = async () => {
    if (!mode) return
    setLoading(true)
    try {
      const res  = await fetch(`/api/reserva/${code}/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: mode, reason: reason.trim() || undefined }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error')
      toast.success(mode === 'reschedule'
        ? 'Solicitud de reagendamiento enviada'
        : 'Solicitud de cancelación enviada')
      if (mode === 'reschedule') setReschedulePending(true)
      if (mode === 'cancel')     setCancelPending(true)
      setMode(null)
      setReason('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No fue posible enviar la solicitud')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {canReschedule && (
          <button
            type="button"
            onClick={() => { setMode('reschedule'); setReason('') }}
            disabled={reschedulePending}
            className="flex items-center justify-center gap-2 rounded-xl border border-champagne px-4 py-2.5 text-sm font-medium text-champagne transition-colors hover:bg-champagne-soft disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:shadow-focus-ring"
          >
            <CalendarClock size={15} strokeWidth={1.5} />
            {reschedulePending ? 'Solicitud enviada' : 'Solicitar reagendar'}
          </button>
        )}
        {canCancel && (
          <button
            type="button"
            onClick={() => { setMode('cancel'); setReason('') }}
            disabled={cancelPending}
            className="flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:shadow-focus-ring"
          >
            <XOctagon size={15} strokeWidth={1.5} />
            {cancelPending ? 'Solicitud enviada' : 'Solicitar cancelación'}
          </button>
        )}
      </div>

      <AnimatePresence>
        {mode && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="req-title"
          >
            <motion.div
              className="absolute inset-0 bg-black/30 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !loading && setMode(null)}
              aria-hidden="true"
            />
            <motion.div
              ref={dialogRef}
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.28 }}
              className="relative w-full max-w-sm rounded-2xl border border-ink-line bg-white p-6 shadow-lift"
            >
              <button
                type="button"
                onClick={() => !loading && setMode(null)}
                aria-label="Cerrar"
                className="absolute top-3 right-3 rounded-lg p-1 text-ink-muted hover:bg-cream-soft hover:text-ink"
              >
                <CloseIcon size={16} />
              </button>
              <h2 id="req-title" className="font-serif text-xl font-light text-ink">
                {mode === 'reschedule' ? '¿Solicitar reagendar?' : '¿Solicitar cancelación?'}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                {mode === 'reschedule'
                  ? 'Avisaremos al equipo y te contactaremos con opciones de horario.'
                  : 'Tu cita seguirá activa hasta que el equipo confirme la cancelación.'}
              </p>

              <label htmlFor="req-reason" className="mt-4 block text-[0.65rem] uppercase tracking-wider text-ink-subtle">
                Mensaje opcional para el equipo
              </label>
              <textarea
                id="req-reason"
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder={mode === 'reschedule'
                  ? 'Ej: Preferiría jueves por la tarde.'
                  : 'Ej: Surgió un imprevisto.'}
                className="mt-1 w-full resize-none rounded-lg border border-ink-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-champagne focus:shadow-focus-ring"
              />

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setMode(null)}
                  disabled={loading}
                  className="rounded-lg px-3 py-1.5 text-sm text-ink-muted hover:bg-cream-soft hover:text-ink disabled:opacity-50"
                >
                  Volver
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={loading}
                  className={
                    'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium ' +
                    (mode === 'cancel'
                      ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                      : 'bg-champagne text-white hover:bg-champagne-deep') +
                    ' disabled:opacity-50'
                  }
                >
                  {loading && <Loader2 size={14} className="animate-spin" />}
                  Enviar solicitud
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
