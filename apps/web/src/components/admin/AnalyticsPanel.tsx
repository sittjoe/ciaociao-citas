'use client'

import { useEffect, useState } from 'react'
import { Loader2, TrendingUp, Clock3, CalendarDays, Percent } from 'lucide-react'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { cn } from '@/lib/utils'

interface AnalyticsData {
  windowDays: number
  totals: { pending: number; confirmed: number; rejected: number; cancelled: number }
  conversionRate: number
  topHour: { hour: number; label: string; count: number }
  topWeekday: { label: string; count: number; order: number }
  hourSeries: { hour: number; label: string; count: number }[]
  weekdaySeries: { label: string; count: number; order: number }[]
  trendSeries: { day: string; count: number }[]
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}

function MetricCard({
  Icon, label, value, sub, accent,
}: {
  Icon: typeof TrendingUp
  label: string
  value: string
  sub?: string
  accent?: 'champagne' | 'sky' | 'emerald' | 'amber'
}) {
  const accentMap: Record<NonNullable<typeof accent>, string> = {
    champagne: 'text-champagne-deep',
    sky:       'text-sky-700',
    emerald:   'text-emerald-700',
    amber:     'text-amber-700',
  }
  return (
    <div className="rounded-2xl border border-admin-line bg-admin-panel p-4">
      <div className="flex items-center gap-2 text-ink-muted text-xs">
        <Icon size={13} strokeWidth={1.5} />
        <span>{label}</span>
      </div>
      <p className={cn('mt-2 font-serif text-2xl font-light', accent && accentMap[accent])}>{value}</p>
      {sub && <p className="mt-1 text-[0.7rem] text-ink-subtle">{sub}</p>}
    </div>
  )
}

/** Inline SVG bar chart — no extra deps, prints crisp at any zoom level. */
function BarChart({
  data, max, height = 110, ariaLabel,
}: {
  data: { label: string; count: number }[]
  max: number
  height?: number
  ariaLabel: string
}) {
  const width = Math.max(data.length * 28, 220)
  const barW = (width - 8) / data.length
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      className="w-full h-[110px]"
      preserveAspectRatio="none"
    >
      {data.map((d, i) => {
        const h = max > 0 ? Math.max(2, (d.count / max) * (height - 18)) : 2
        const x = 4 + i * barW
        const y = height - h - 14
        return (
          <g key={`${d.label}-${i}`}>
            <rect
              x={x}
              y={y}
              width={Math.max(2, barW - 4)}
              height={h}
              rx={2}
              className="fill-champagne"
              opacity={0.85}
            >
              <title>{`${d.label}: ${d.count}`}</title>
            </rect>
            <text
              x={x + barW / 2 - 2}
              y={height - 2}
              textAnchor="middle"
              className="fill-ink-subtle"
              style={{ fontSize: 8 }}
            >
              {d.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/** Inline SVG line chart for the 30-day trend. */
function LineChart({
  data, height = 140, ariaLabel,
}: {
  data: { day: string; count: number }[]
  height?: number
  ariaLabel: string
}) {
  if (data.length === 0) return null
  const width = Math.max(data.length * 14, 320)
  const max = Math.max(1, ...data.map(d => d.count))
  const stepX = (width - 16) / Math.max(1, data.length - 1)
  const points = data.map((d, i) => {
    const x = 8 + i * stepX
    const y = height - 18 - (d.count / max) * (height - 32)
    return { x, y, d }
  })
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      className="w-full h-[140px]"
      preserveAspectRatio="none"
    >
      <path d={path} className="stroke-champagne fill-none" strokeWidth={1.5} />
      {points.map((p, i) => (
        <circle key={p.d.day + i} cx={p.x} cy={p.y} r={1.6} className="fill-champagne-deep">
          <title>{`${p.d.day}: ${p.d.count}`}</title>
        </circle>
      ))}
      {/* Sparse x-axis labels: first, middle, last. */}
      {[0, Math.floor(points.length / 2), points.length - 1].map(i => (
        <text
          key={`lbl-${i}`}
          x={points[i].x}
          y={height - 3}
          textAnchor="middle"
          className="fill-ink-subtle"
          style={{ fontSize: 8 }}
        >
          {points[i].d.day.slice(5)}
        </text>
      ))}
    </svg>
  )
}

export function AnalyticsPanel() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/analytics')
      .then(r => {
        if (!r.ok) throw new Error('Error al cargar métricas')
        return r.json()
      })
      .then((d: AnalyticsData) => { if (!cancelled) setData(d) })
      .catch(err => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [])

  if (error) {
    return (
      <Card variant="admin">
        <CardBody>
          <p className="text-sm text-red-600">{error}</p>
        </CardBody>
      </Card>
    )
  }

  if (!data) {
    return (
      <Card variant="admin">
        <CardBody>
          <div className="flex items-center justify-center py-8 text-ink-muted">
            <Loader2 size={18} className="animate-spin text-champagne" />
            <span className="ml-2 text-sm">Cargando métricas…</span>
          </div>
        </CardBody>
      </Card>
    )
  }

  const totalCreated = data.totals.pending + data.totals.confirmed + data.totals.rejected + data.totals.cancelled
  const hourMax = Math.max(1, ...data.hourSeries.map(h => h.count))
  const weekdayMax = Math.max(1, ...data.weekdaySeries.map(w => w.count))

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          Icon={Percent}
          label="Tasa de conversión (30d)"
          value={pct(data.conversionRate)}
          sub={`${data.totals.confirmed} confirmadas / ${totalCreated} solicitudes`}
          accent="champagne"
        />
        <MetricCard
          Icon={Clock3}
          label="Hora más popular"
          value={data.topHour.count > 0 ? data.topHour.label : '—'}
          sub={data.topHour.count > 0 ? `${data.topHour.count} citas` : 'Sin datos'}
          accent="sky"
        />
        <MetricCard
          Icon={CalendarDays}
          label="Día más popular"
          value={data.topWeekday.count > 0 ? data.topWeekday.label : '—'}
          sub={data.topWeekday.count > 0 ? `${data.topWeekday.count} citas` : 'Sin datos'}
          accent="emerald"
        />
        <MetricCard
          Icon={TrendingUp}
          label="Solicitudes (30d)"
          value={String(totalCreated)}
          sub={`${data.totals.pending} pendientes · ${data.totals.rejected} rechazadas`}
          accent="amber"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card variant="admin" className="lg:col-span-2">
          <CardHeader>
            <h3 className="font-serif text-base font-light text-ink">Tendencia 30 días</h3>
            <p className="text-[0.7rem] text-ink-subtle">Citas creadas por día.</p>
          </CardHeader>
          <CardBody className="pt-0">
            <LineChart data={data.trendSeries} ariaLabel="Tendencia de citas por día" />
          </CardBody>
        </Card>

        <Card variant="admin">
          <CardHeader>
            <h3 className="font-serif text-base font-light text-ink">Por día de la semana</h3>
            <p className="text-[0.7rem] text-ink-subtle">Citas confirmadas.</p>
          </CardHeader>
          <CardBody className="pt-0">
            {data.weekdaySeries.length === 0 ? (
              <p className="text-xs text-ink-subtle py-4 text-center">Sin datos.</p>
            ) : (
              <BarChart
                data={data.weekdaySeries.map(w => ({ label: w.label.slice(0, 3), count: w.count }))}
                max={weekdayMax}
                ariaLabel="Citas confirmadas por día de la semana"
              />
            )}
          </CardBody>
        </Card>
      </div>

      <Card variant="admin">
        <CardHeader>
          <h3 className="font-serif text-base font-light text-ink">Distribución horaria</h3>
          <p className="text-[0.7rem] text-ink-subtle">Citas confirmadas por hora del día (zona MX).</p>
        </CardHeader>
        <CardBody className="pt-0">
          <BarChart
            data={data.hourSeries.filter(h => h.count > 0 || (h.hour >= 9 && h.hour <= 20)).map(h => ({
              label: String(h.hour).padStart(2, '0'),
              count: h.count,
            }))}
            max={hourMax}
            ariaLabel="Citas por hora del día"
          />
        </CardBody>
      </Card>
    </div>
  )
}
