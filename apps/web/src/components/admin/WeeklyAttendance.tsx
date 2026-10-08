import { formatInTimeZone } from 'date-fns-tz'
import { parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { WeekBucket } from '@/lib/agenda'

const weekLabel = (key: string) =>
  formatInTimeZone(parseISO(`${key}T12:00:00Z`), 'UTC', 'd MMM', { locale: es }).replace(/\./g, '')

/**
 * Barras apiladas por semana: asistió (champagne), no asistió (rojo suave),
 * sin marcar (línea). Sin pista de fondo ni librería de gráficas: es CSS y
 * se pinta en el servidor. La tabla oculta da los mismos números a lectores
 * de pantalla.
 */
export function WeeklyAttendance({ weeks }: { weeks: WeekBucket[] }) {
  const max = Math.max(1, ...weeks.map(w => w.attended + w.noShow + w.unmarked))
  return (
    <div className="mt-5">
      <div aria-hidden className="flex h-40 items-end gap-2 sm:gap-3">
        {weeks.map(w => {
          const total = w.attended + w.noShow + w.unmarked
          const pct = (n: number) => `${(n / max) * 100}%`
          return (
            <div key={w.weekKey} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
              <span className="text-xs tabular-nums text-ink-muted">{total || ''}</span>
              <div className="flex w-full max-w-[44px] flex-col-reverse overflow-hidden rounded-md" style={{ height: pct(total) }}>
                <span className="block bg-champagne-solid" style={{ height: total ? `${(w.attended / total) * 100}%` : 0 }} />
                <span className="block bg-red-300" style={{ height: total ? `${(w.noShow / total) * 100}%` : 0 }} />
                <span className="block bg-admin-line" style={{ height: total ? `${(w.unmarked / total) * 100}%` : 0 }} />
              </div>
            </div>
          )
        })}
      </div>
      <div aria-hidden className="mt-2 flex gap-2 border-t border-admin-line pt-2 sm:gap-3">
        {weeks.map(w => (
          <span key={w.weekKey} className="flex-1 text-center text-[0.7rem] text-ink-muted">{weekLabel(w.weekKey)}</span>
        ))}
      </div>
      <div aria-hidden className="mt-3 flex flex-wrap gap-4 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-champagne-solid" />Asistió</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-300" />No asistió</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-admin-line" />Sin marcar</span>
      </div>
      <table className="sr-only">
        <caption>Citas confirmadas por semana</caption>
        <thead><tr><th>Semana del</th><th>Asistió</th><th>No asistió</th><th>Sin marcar</th></tr></thead>
        <tbody>
          {weeks.map(w => (
            <tr key={w.weekKey}><td>{weekLabel(w.weekKey)}</td><td>{w.attended}</td><td>{w.noShow}</td><td>{w.unmarked}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
