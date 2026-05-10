import type { Metadata } from 'next'
import { CalendarioClient } from './CalendarioClient'

export const metadata: Metadata = { title: 'Calendario' }

export default function CalendarioPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="h-eyebrow mb-2">Vista de calendario</p>
        <h1 className="font-serif text-2xl text-ink">Calendario</h1>
        <p className="text-sm text-ink-muted mt-1">
          Visualiza y gestiona todas las citas. Haz clic en cualquier evento para ver detalles.
        </p>
        <p className="text-xs text-ink-subtle mt-2">
          Atajos: <kbd>J</kbd>/<kbd>K</kbd> navegar · <kbd>T</kbd> hoy · <kbd>M</kbd>/<kbd>W</kbd>/<kbd>D</kbd> vista
        </p>
      </div>
      <CalendarioClient />
    </div>
  )
}
