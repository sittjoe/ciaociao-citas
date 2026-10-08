import { Gem } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { TitleReveal, DepthReveal } from '@/components/motion/cinematic'
import type { ConfirmView } from '@/lib/appointment-confirm'
import ConfirmPanel, { ConfirmedView, SummaryList } from './ConfirmPanel'

const LINK_QUIET = 'inline-flex min-h-[44px] items-center px-2 text-sm font-medium text-champagne-solid transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:shadow-focus-ring rounded-lg'

function Notice({ title, children, action }: {
  title: string
  children: React.ReactNode
  action: { href: string; label: string }
}) {
  return (
    <Card variant="soft" className="p-6 text-center">
      <h2 className="mb-2 font-serif text-2xl font-light text-ink">{title}</h2>
      <div className="mb-5 text-sm leading-6 text-ink-muted">{children}</div>
      <a href={action.href} className={LINK_QUIET}>{action.label} →</a>
    </Card>
  )
}

function Body({ view, token }: { view: Exclude<ConfirmView, { state: 'invalid' }> | 'error'; token: string }) {
  if (view === 'error') {
    return (
      <Notice title="No pudimos cargar tu cita" action={{ href: `/confirmar/${encodeURIComponent(token)}`, label: 'Intentar de nuevo' }}>
        Ocurrió un error de nuestro lado. Intenta de nuevo en un momento o escríbenos a hola@ciaociao.mx.
      </Notice>
    )
  }
  switch (view.state) {
    case 'pending_client': {
      const { state: _s, ...summary } = view
      return <ConfirmPanel token={token} summary={summary} />
    }
    case 'already': {
      const { state: _s, ...summary } = view
      return <ConfirmedView summary={summary} already />
    }
    case 'past': {
      const { state: _s, ...summary } = view
      return (
        <Card variant="soft" className="p-6 text-center">
          <h2 className="mb-2 font-serif text-2xl font-light text-ink">Esta cita ya pasó</h2>
          <p className="mb-5 text-sm leading-6 text-ink-muted">
            La fecha de esta cita ya quedó atrás, así que no es necesario confirmarla. Nos encantará verte de nuevo.
          </p>
          <div className="mb-5 text-left"><SummaryList summary={summary} /></div>
          <a href="/" className={LINK_QUIET}>Agendar una nueva cita →</a>
        </Card>
      )
    }
    case 'cancelled':
      return (
        <Notice title="Esta cita fue cancelada" action={{ href: '/', label: 'Agendar una nueva cita' }}>
          Ya no es necesario confirmarla. Si quieres visitarnos, elige otro horario cuando gustes.
        </Notice>
      )
    case 'rejected':
      return (
        <Notice title="Esta solicitud no fue aprobada" action={{ href: '/', label: 'Elegir otro horario' }}>
          En este momento no pudimos reservar ese horario. Te invitamos a elegir otro disponible.
        </Notice>
      )
    case 'awaiting_team':
      return (
        <Notice title="Tu cita está en revisión" action={{ href: '/', label: 'Ir al inicio' }}>
          Nuestro equipo aún está revisando tu solicitud. Te escribiremos en cuanto quede lista.
        </Notice>
      )
    default:
      return (
        <Notice title="No es posible confirmar" action={{ href: '/', label: 'Ir al inicio' }}>
          Esta cita no se puede confirmar desde aquí. Escríbenos a hola@ciaociao.mx y te ayudamos.
        </Notice>
      )
  }
}

/** Pantalla completa de /confirmar/[token] para una vista ya resuelta (sin E/S). */
export default function ConfirmScreen(props: { view: Exclude<ConfirmView, { state: 'invalid' }> | 'error'; token: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-4 py-12 sm:py-16">
      <div className="w-full max-w-sm">
        <header className="mb-8 text-center">
          <h1 className="font-serif text-3xl tracking-display-eyebrow text-ink"><TitleReveal text="CIAO CIAO" /></h1>
          <p className="mt-1.5 text-11 uppercase tracking-display-eyebrow text-champagne-solid">Joyería fina · Showroom privado</p>
        </header>

        <DepthReveal delay={0.2}><Body {...props} /></DepthReveal>

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-ink-subtle">
          <Gem size={12} strokeWidth={1.5} className="text-champagne" aria-hidden />
          Showroom privado CDMX
        </div>
      </div>
    </main>
  )
}
