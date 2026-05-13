import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { requireAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const MX_TZ = 'America/Mexico_City'

const HOUR_FMT = new Intl.DateTimeFormat('es-MX', { timeZone: MX_TZ, hour: '2-digit', hour12: false })
const WEEKDAY_FMT = new Intl.DateTimeFormat('es-MX', { timeZone: MX_TZ, weekday: 'short' })
const DAY_KEY_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: MX_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

function getHour(d: Date): number {
  const parts = HOUR_FMT.format(d).replace(/[^\d]/g, '')
  return Number(parts) || 0
}

function getWeekday(d: Date): string {
  // Capitalize first letter for display.
  const raw = WEEKDAY_FMT.format(d).replace('.', '')
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

function dayKey(d: Date): string {
  return DAY_KEY_FMT.format(d) // YYYY-MM-DD
}

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const now = new Date()
    const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const snap = await adminDb
      .collection('appointments')
      .where('createdAt', '>=', Timestamp.fromDate(since))
      .get()

    let pending = 0
    let confirmed = 0
    let rejected = 0
    let cancelled = 0

    const hourBuckets = new Map<number, number>() // 0..23
    const weekdayBuckets = new Map<string, { count: number; order: number }>()
    const dayBuckets = new Map<string, number>()

    // Seed buckets so the chart shows a full 30-day window even if 0s.
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      dayBuckets.set(dayKey(d), 0)
    }

    for (const doc of snap.docs) {
      const d = doc.data()
      switch (d.status) {
        case 'pending':   pending++;   break
        case 'accepted':  confirmed++; break
        case 'rejected':  rejected++;  break
        case 'cancelled': cancelled++; break
      }

      const created = (d.createdAt as Timestamp | undefined)?.toDate()
      if (created) {
        const k = dayKey(created)
        if (dayBuckets.has(k)) dayBuckets.set(k, (dayBuckets.get(k) ?? 0) + 1)
      }

      // Hour/weekday distribution: confirmed citas only — that's what matters
      // for staffing.
      if (d.status === 'accepted') {
        const slot = (d.slotDatetime as Timestamp | undefined)?.toDate()
        if (slot) {
          const h = getHour(slot)
          hourBuckets.set(h, (hourBuckets.get(h) ?? 0) + 1)
          const wd = getWeekday(slot)
          // Use day-of-week index relative to Monday=0 for stable ordering.
          const order = (slot.getDay() + 6) % 7
          const prev = weekdayBuckets.get(wd)
          weekdayBuckets.set(wd, { count: (prev?.count ?? 0) + 1, order })
        }
      }
    }

    const decided = confirmed + rejected + pending
    const conversionRate = decided > 0 ? confirmed / decided : 0

    const hourSeries = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: `${String(h).padStart(2, '0')}:00`,
      count: hourBuckets.get(h) ?? 0,
    }))

    const weekdaySeries = Array.from(weekdayBuckets.entries())
      .map(([label, v]) => ({ label, count: v.count, order: v.order }))
      .sort((a, b) => a.order - b.order)

    const trendSeries = Array.from(dayBuckets.entries()).map(([day, count]) => ({
      day,
      count,
    }))

    const topHour = hourSeries.reduce(
      (acc, cur) => (cur.count > acc.count ? cur : acc),
      { hour: -1, label: '—', count: 0 },
    )
    const topWeekday = weekdaySeries.reduce(
      (acc, cur) => (cur.count > acc.count ? cur : acc),
      { label: '—', count: 0, order: -1 },
    )

    return NextResponse.json({
      windowDays: 30,
      totals: { pending, confirmed, rejected, cancelled },
      conversionRate,
      topHour,
      topWeekday,
      hourSeries,
      weekdaySeries,
      trendSeries,
    })
  } catch (err) {
    console.error('GET /api/admin/analytics', err)
    return NextResponse.json({ error: 'Error al calcular métricas' }, { status: 500 })
  }
}
