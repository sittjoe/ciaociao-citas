'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertCircle, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import type { ConfirmSummary } from '@/lib/appointment-confirm'

type Phase =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'done'; already: boolean; summary: ConfirmSummary }
  | { kind: 'blocked'; message: string }   // 404/409: ya no se puede confirmar
  | { kind: 'retry'; message: string }     // red, 429, 500: puede reintentar

const LINK_PRIMARY = 'flex min-h-[48px] w-full items-center justify-center rounded-xl bg-champagne-solid px-5 py-3 text-sm font-semibold text-white transition-colors duration-150 hover:bg-champagne-deep focus-visible:outline-none focus-visible:shadow-focus-ring'
const LINK_QUIET   = 'inline-flex min-h-[44px] items-center px-2 text-sm font-medium text-champagne-solid transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:shadow-focus-ring rounded-lg'

export function SummaryList({ summary }: { summary: ConfirmSummary }) {
  return (
    <dl className="rounded-xl border border-ink-line bg-porcelain/70 px-4 py-1 text-sm">
      {([
        ['Fecha',  summary.dateStr],
        ['Hora',   summary.timeStr],
        ['Código', summary.code],
      ] as const).map(([label, value]) => (
        <div key={label} className="flex justify-between gap-5 border-b border-ink-line py-2.5 last:border-0">
          <dt className="text-ink-muted">{label}</dt>
          <dd className="text-right font-semibold text-ink first-letter:uppercase">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function ConfirmedView({ summary, already }: { summary: ConfirmSummary; already: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [])
  const greeting = summary.name ? `, ${summary.name}` : ''
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.42 }}
    >
    <Card variant="soft" className="p-6">
      <div className="mb-4 flex items-center justify-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-champagne-soft text-champagne-solid" aria-hidden>
          <Check size={22} strokeWidth={1.5} />
        </span>
      </div>
      <h2 ref={heading} tabIndex={-1} className="mb-1 text-center font-serif text-2xl font-light text-ink focus:outline-none focus-visible:shadow-none">
        {already ? 'Tu cita ya estaba confirmada' : 'Tu cita está confirmada'}
      </h2>
      <p className="mb-5 text-center text-sm text-ink-muted">
        {already
          ? `Todo en orden${greeting}. Te esperamos.`
          : `Gracias${greeting}. Te esperamos en el showroom.`}
      </p>
      <div className="mb-5"><SummaryList summary={summary} /></div>
      <a href={summary.reservaHref} className={LINK_PRIMARY}>
        Ver detalles de mi cita
      </a>
    </Card>
    </motion.div>
  )
}

export default function ConfirmPanel({ token, summary }: { token: string; summary: ConfirmSummary }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const errorRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (phase.kind === 'blocked' || phase.kind === 'retry') errorRef.current?.focus()
  }, [phase])

  const confirm = async () => {
    if (phase.kind === 'sending') return
    setPhase({ kind: 'sending' })
    try {
      const res = await fetch(`/api/confirm/${encodeURIComponent(token)}`, {
        method:      'POST',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ token }),
        credentials: 'same-origin',
        cache:       'no-store',
      })
      const json = await res.json().catch(() => ({})) as Partial<ConfirmSummary> & {
        ok?: boolean; alreadyConfirmed?: boolean; error?: string
      }
      if (res.ok && json.ok) {
        setPhase({
          kind: 'done',
          already: json.alreadyConfirmed === true,
          summary: {
            name:        json.name ?? summary.name,
            dateStr:     json.dateStr ?? summary.dateStr,
            timeStr:     json.timeStr ?? summary.timeStr,
            code:        json.code ?? summary.code,
            reservaHref: json.reservaHref ?? summary.reservaHref,
          },
        })
        return
      }
      const message = json.error ?? 'No pudimos confirmar tu cita.'
      if (res.status === 404 || res.status === 409) setPhase({ kind: 'blocked', message })
      else setPhase({ kind: 'retry', message })
    } catch {
      setPhase({ kind: 'retry', message: 'Sin conexión. Revisa tu internet e intenta de nuevo.' })
    }
  }

  if (phase.kind === 'done') {
    return <ConfirmedView summary={phase.summary} already={phase.already} />
  }

  if (phase.kind === 'blocked') {
    return (
      <Card variant="soft" className="p-6 text-center">
        <h2 className="mb-2 font-serif text-2xl font-light text-ink">No es posible confirmar</h2>
        <p ref={errorRef} tabIndex={-1} role="alert" className="mb-5 text-sm text-ink-muted focus:outline-none focus-visible:shadow-none">
          {phase.message}
        </p>
        <a href={summary.reservaHref} className={LINK_QUIET}>Ver mi cita →</a>
      </Card>
    )
  }

  const sending = phase.kind === 'sending'
  const greeting = summary.name ? `${summary.name}, ` : ''
  return (
    <Card variant="soft" className="p-6">
      <p className="h-eyebrow mb-2 text-center">Confirmación de asistencia</p>
      <h2 className="mb-1 text-center font-serif text-2xl font-light text-ink">¿Nos confirmas tu visita?</h2>
      <p className="mb-5 text-center text-sm leading-6 text-ink-muted">
        {greeting}así preparamos tu cita con calma y las piezas listas para ti.
      </p>
      <div className="mb-5"><SummaryList summary={summary} /></div>

      {phase.kind === 'retry' && (
        <p
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 focus:outline-none focus-visible:shadow-none"
        >
          <AlertCircle size={16} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden />
          {phase.message}
        </p>
      )}

      <Button
        type="button"
        onClick={confirm}
        loading={sending}
        aria-busy={sending}
        className="w-full hover:translate-y-0 focus-visible:outline-none focus-visible:shadow-focus-ring"
      >
        {sending ? 'Confirmando…' : 'Sí, confirmar mi cita'}
      </Button>
      <p aria-live="polite" className="sr-only">{sending ? 'Confirmando tu cita' : ''}</p>

      <div className="mt-3 text-center">
        <a href={summary.reservaHref} className={LINK_QUIET}>
          ¿No podrás asistir? Cambiar o cancelar
        </a>
      </div>
    </Card>
  )
}
