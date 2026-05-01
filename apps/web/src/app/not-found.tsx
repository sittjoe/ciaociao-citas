import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Página no encontrada' }

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 bg-cream text-center">
      <p className="text-xs font-semibold tracking-[0.35em] uppercase text-champagne mb-3">404</p>
      <h1 className="font-serif text-4xl sm:text-5xl text-ink tracking-tight mb-4">Página no encontrada</h1>
      <p className="text-sm text-ink-muted max-w-xs mb-8 leading-relaxed">
        Esta página no existe o el código de reserva no es válido.
      </p>
      <Link href="/" className="btn-primary text-sm">
        Volver al inicio
      </Link>
    </main>
  )
}
