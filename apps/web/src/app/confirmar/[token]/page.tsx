import type { Metadata } from 'next'
import { adminDb } from '@/lib/firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { formatDate, formatTime } from '@/lib/utils'
import { Card } from '@/components/ui/Card'
import { Gem } from 'lucide-react'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Confirmar cita — Ciao Ciao' }

interface PageProps { params: Promise<{ token: string }> }

type ConfirmResult =
  | { state: 'confirmed';      name: string; dateStr: string; timeStr: string; code: string }
  | { state: 'already';        name: string; dateStr: string; timeStr: string; code: string }
  | { state: 'not_accepted';   reason: string }
  | { state: 'invalid' }
  | { state: 'error' }

async function resolveToken(token: string): Promise<ConfirmResult> {
  if (!token || token.length < 8) return { state: 'invalid' }

  try {
    const snap = await adminDb
      .collection('appointments')
      .where('cancelToken', '==', token)
      .limit(1)
      .get()

    if (snap.empty) return { state: 'invalid' }

    const doc  = snap.docs[0]
    const data = doc.data()
    const name    = data.name as string
    const code    = data.confirmationCode as string
    const dateStr = formatDate((data.slotDatetime as Timestamp).toDate())
    const timeStr = formatTime((data.slotDatetime as Timestamp).toDate())

    if (data.status !== 'accepted') {
      const reason =
        data.status === 'cancelled' ? 'Esta cita ya fue cancelada.' :
        data.status === 'rejected'  ? 'Esta solicitud fue rechazada.' :
        data.status === 'pending'   ? 'Tu cita aún no ha sido aprobada por el equipo.' :
        'No se puede confirmar esta cita.'
      return { state: 'not_accepted', reason }
    }

    if (data.clientConfirmed === true) {
      return { state: 'already', name, dateStr, timeStr, code }
    }

    await doc.ref.update({
      clientConfirmed: true,
      clientConfirmedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    return { state: 'confirmed', name, dateStr, timeStr, code }
  } catch {
    return { state: 'error' }
  }
}

export default async function ConfirmarPage({ params }: PageProps) {
  const { token } = await params
  const result = await resolveToken(token)

  return (
    <main className="min-h-screen bg-cream flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-serif text-3xl tracking-widest text-ink">CIAO CIAO</h1>
          <p className="mt-1.5 text-[11px] tracking-[3px] uppercase text-champagne">Joyería fina · Showroom privado</p>
        </div>

        {(result.state === 'confirmed' || result.state === 'already') && (
          <Card variant="soft" className="p-6">
            <div className="mb-4 flex items-center justify-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-600 text-2xl">✓</span>
            </div>
            <p className="font-serif text-xl text-ink text-center mb-1">
              {result.state === 'confirmed' ? '¡Cita confirmada!' : 'Cita ya confirmada'}
            </p>
            <p className="text-sm text-ink-muted text-center mb-5">
              {result.state === 'confirmed'
                ? `Gracias, ${result.name}. Te esperamos en el showroom.`
                : `Tu cita ya estaba confirmada, ${result.name}.`}
            </p>
            <div className="rounded-xl border border-ink-line bg-porcelain/70 px-4 py-1 text-sm mb-5">
              {([
                ['Fecha', result.dateStr],
                ['Hora',  result.timeStr],
                ['Código', result.code],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-5 border-b border-ink-line py-2.5 last:border-0">
                  <span className="text-ink-muted">{label}</span>
                  <span className="text-ink font-semibold text-right">{value}</span>
                </div>
              ))}
            </div>
            <a
              href={`/reserva/${result.code}`}
              className="flex w-full items-center justify-center rounded-xl bg-champagne px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-champagne-deep"
            >
              Ver detalles de mi cita
            </a>
          </Card>
        )}

        {result.state === 'not_accepted' && (
          <Card variant="soft" className="p-6 text-center">
            <p className="font-serif text-xl text-ink mb-2">No es posible confirmar</p>
            <p className="text-sm text-ink-muted mb-5">{result.reason}</p>
            <a href="/" className="text-sm font-medium text-champagne hover:text-champagne-deep transition-colors">
              Agendar nueva cita →
            </a>
          </Card>
        )}

        {(result.state === 'invalid' || result.state === 'error') && (
          <Card variant="soft" className="p-6 text-center">
            <p className="font-serif text-xl text-ink mb-2">
              {result.state === 'invalid' ? 'Enlace inválido' : 'Error inesperado'}
            </p>
            <p className="text-sm text-ink-muted mb-5">
              {result.state === 'invalid'
                ? 'Este enlace no es válido o ya expiró.'
                : 'Ocurrió un error. Por favor intenta de nuevo o contáctanos.'}
            </p>
            <a href="/" className="text-sm font-medium text-champagne hover:text-champagne-deep transition-colors">
              Ir al inicio →
            </a>
          </Card>
        )}

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-ink-subtle">
          <Gem size={12} strokeWidth={1.5} className="text-champagne" />
          Showroom privado CDMX
        </div>
      </div>
    </main>
  )
}
