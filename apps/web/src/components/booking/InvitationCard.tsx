'use client'

import { useCallback } from 'react'
import { parseISO } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { es } from 'date-fns/locale'
import { Check, CalendarPlus } from 'lucide-react'
import { motion } from '@/components/motion'
import { HouseSeal, Wordmark } from '@/components/brand/Wordmark'
import { BUSINESS_TZ, cn } from '@/lib/utils'
import { buildPendingIcs, pendingGoogleCalendarUrl } from '@/lib/pending-ics'
import type { AppointmentType } from '@/types'

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

interface InvitationCardProps {
  name: string
  email: string
  /** ISO del horario elegido. */
  datetime: string
  appointmentType: AppointmentType
  /** «1:00 pm» o «4:00 pm CDMX · 3:00 pm tu hora». */
  timeLabel: string
  code: string
  reservaHref: string
}

/**
 * Cierre del flujo: la solicitud se entrega como una tarjeta de invitación
 * grabada (filete doble, sello de la casa, marca en Cinzel). Es el momento
 * final de la reserva y debe sentirse como recibir algo, no como un recibo.
 */
export function InvitationCard({ name, email, datetime, appointmentType, timeLabel, code, reservaHref }: InvitationCardProps) {
  const isVideo = appointmentType === 'video_engagement_rings'
  const date = parseISO(datetime)
  const dayLabel = formatInTimeZone(date, BUSINESS_TZ, "EEEE d 'de' MMMM", { locale: es })
  const dayTitle = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1)
  const year = formatInTimeZone(date, BUSINESS_TZ, 'yyyy')
  const firstName = name.trim().split(/\s+/)[0] ?? ''

  const downloadIcs = useCallback(() => {
    const ics = buildPendingIcs({ datetime, code, type: appointmentType, origin: window.location.origin })
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `cita-ciaociao-${code}.ics`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, [datetime, code, appointmentType])

  const nextSteps = [
    { done: true,  text: 'Recibimos tu solicitud.' },
    { done: false, text: `El equipo la revisa y te confirma a ${email}.` },
    {
      done: false,
      text: isVideo
        ? 'El enlace de la videollamada llega antes de la llamada.'
        : 'La dirección del showroom llega con tu confirmación.',
    },
  ]

  return (
    <div className="space-y-8" role="status" aria-live="polite">
      <motion.article
        aria-label="Tu solicitud de cita"
        initial={{ opacity: 0, y: 28, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.9, ease: EASE }}
        className="engraved relative overflow-hidden rounded-[1.6rem] px-6 pb-8 pt-10 text-center sm:px-10 sm:pt-12"
      >
        <motion.div
          className="flex justify-center"
          initial={{ opacity: 0, scale: 1.35 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: EASE, delay: 0.45 }}
        >
          <HouseSeal size={60} />
        </motion.div>

        <Wordmark className="mt-5 text-[0.95rem] text-champagne-deep" />

        <motion.div
          aria-hidden
          className="ornament-rule mx-auto my-6 max-w-[12rem]"
          initial={{ opacity: 0, scaleX: 0.3 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.6 }}
        >
          <span className="h-1.5 w-1.5 rotate-45 bg-champagne" />
        </motion.div>

        <p className="font-serif text-lg italic text-ink-muted">
          {isVideo ? 'Solicitud de videollamada para' : 'Solicitud de cita privada para'}
        </p>
        <h2 className="mt-1 font-serif text-[clamp(2rem,6vw,2.6rem)] font-light leading-tight text-ink">
          {name}
        </h2>

        <div className="mx-auto mt-7 max-w-sm border-y border-ink-line py-5">
          <p className="font-serif text-[1.75rem] font-light leading-tight text-ink">{dayTitle}</p>
          <p className="mt-1 text-sm text-ink-muted">
            {timeLabel} · {isVideo ? 'Por videollamada' : 'En el showroom'} · {year}
          </p>
        </div>

        <dl className="mx-auto mt-6 flex max-w-sm items-center justify-between gap-4 text-left">
          <div>
            <dt className="text-xs text-ink-muted">Código</dt>
            <dd className="mt-0.5 text-lg font-medium tabular-nums tracking-[0.14em] text-ink">{code}</dd>
          </div>
          <div className="text-right">
            <dt className="text-xs text-ink-muted">Estado</dt>
            <dd className="mt-1 inline-flex items-center rounded-full border border-champagne-soft bg-champagne-tint px-3 py-1 text-xs font-medium text-champagne-deep">
              En revisión
            </dd>
          </div>
        </dl>
      </motion.article>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: EASE, delay: 0.9 }}
        className="space-y-6"
      >
        <div className="grid gap-2.5 sm:grid-cols-2">
          <button
            type="button"
            onClick={downloadIcs}
            className="btn-atelier min-h-[48px] w-full text-sm"
          >
            <CalendarPlus size={16} strokeWidth={1.5} />
            Agregar a mi calendario
          </button>
          <a
            href={pendingGoogleCalendarUrl(datetime, code, appointmentType)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-[48px] w-full items-center justify-center rounded-xl border border-champagne px-5 text-sm font-medium text-champagne-solid transition-colors duration-200 hover:bg-champagne-tint"
          >
            Google Calendar
          </a>
        </div>

        <div className="rounded-2xl bg-[var(--paper-deep)] px-5 py-5">
          <p className="font-serif text-xl text-ink">
            {firstName ? `${firstName}, esto sigue` : 'Esto sigue'}
          </p>
          <ol className="mt-3 space-y-3">
            {nextSteps.map((item, i) => (
              <li key={i} className="flex items-start gap-3 text-sm leading-6">
                <span
                  aria-hidden
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[0.65rem]',
                    item.done ? 'border-champagne-solid bg-champagne-solid text-porcelain' : 'border-ink-line text-ink-muted',
                  )}
                >
                  {item.done ? <Check size={12} strokeWidth={2} /> : i + 1}
                </span>
                <span className={item.done ? 'text-ink' : 'text-ink-muted'}>
                  <span className="sr-only">{item.done ? 'Hecho: ' : 'Pendiente: '}</span>
                  {item.text}
                </span>
              </li>
            ))}
          </ol>
          <a
            href={reservaHref}
            className="mt-4 inline-flex min-h-[44px] items-center text-sm font-medium text-champagne-solid underline decoration-champagne/50 underline-offset-4 hover:text-champagne-deep"
          >
            Ver mi reserva
          </a>
        </div>
      </motion.div>
    </div>
  )
}
