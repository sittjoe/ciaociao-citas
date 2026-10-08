import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getConfirmation, type ConfirmView } from '@/lib/appointment-confirm'
import ConfirmScreen from './ConfirmScreen'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title:  'Confirmar cita — Ciao Ciao',
  robots: { index: false, follow: false, nocache: true },
}

interface PageProps { params: Promise<{ token: string }> }

/**
 * GET solo LEE. Abrir este enlace (un escáner de correo, una vista previa)
 * nunca confirma: la clienta lo hace con el botón, que manda un POST a
 * /api/confirm/[token]. Los enlaces viejos de los correos llegan aquí igual
 * y ahora ven el botón en lugar de quedar confirmados solos.
 */
export default async function ConfirmarPage({ params }: PageProps) {
  const { token } = await params

  let view: ConfirmView | 'error'
  try {
    view = await getConfirmation(token)
  } catch (err) {
    console.error('GET /confirmar', err)
    view = 'error'
  }
  if (view !== 'error' && view.state === 'invalid') notFound()

  return <ConfirmScreen view={view} token={token} />
}
