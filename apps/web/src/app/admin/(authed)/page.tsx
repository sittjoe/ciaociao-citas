import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { UpcomingList, OverdueFollowUpsList, type OverdueFollowUpItem } from '@/components/admin/StatsCards'
import { WeeklyAttendance } from '@/components/admin/WeeklyAttendance'
import { BUSINESS_TZ, cn } from '@/lib/utils'
import { attendanceRate, bucketByWeek, nextDayKeys, weekStartKey, type WeekBucket } from '@/lib/agenda'
import type { AdminStats, Appointment, AppointmentStatus, CommercialStatus } from '@/types'

export const dynamic  = 'force-dynamic'
export const metadata: Metadata = { title: 'Resumen' }

const WEEKS = 8

const EMPTY_STATS: AdminStats = {
  totalPending: 0, acceptedToday: 0, totalAccepted: 0, totalRejected: 0,
  upcomingSlots: 0, conversion: null, decided: 0, nextAppointments: [],
}

async function getStats(): Promise<{ stats: AdminStats; error: boolean }> {
  const now        = new Date()
  // «Hoy» es el día de CDMX, no el del reloj del servidor (UTC): antes, de
  // 6 pm en adelante «Confirmadas hoy» contaba las de mañana.
  const todayKey   = formatInTimeZone(now, BUSINESS_TZ, 'yyyy-MM-dd')
  const todayStart = fromZonedTime(`${todayKey}T00:00:00`, BUSINESS_TZ)
  const todayEnd   = fromZonedTime(`${nextDayKeys(todayKey, 2)[1]}T00:00:00`, BUSINESS_TZ)
  const weekEnd    = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  try {
    const [pendingSnap, acceptedTodaySnap, totalAcceptedSnap, totalRejectedSnap, upcomingSlotsSnap, nextApptSnap] =
      await Promise.all([
        adminDb.collection('appointments').where('status', '==', 'pending').count().get(),
        adminDb.collection('appointments')
          .where('status', '==', 'accepted')
          .where('slotDatetime', '>=', Timestamp.fromDate(todayStart))
          .where('slotDatetime', '<',  Timestamp.fromDate(todayEnd))
          .count().get(),
        adminDb.collection('appointments').where('status', '==', 'accepted').count().get(),
        adminDb.collection('appointments').where('status', '==', 'rejected').count().get(),
        adminDb.collection('slots')
          .where('available', '==', true)
          .where('datetime', '>=', Timestamp.fromDate(now))
          .where('datetime', '<',  Timestamp.fromDate(weekEnd))
          .count().get(),
        adminDb.collection('appointments')
          .where('status', 'in', ['pending', 'accepted'])
          .where('slotDatetime', '>=', Timestamp.fromDate(now))
          .orderBy('slotDatetime')
          .limit(5)
          .get(),
      ])

    const nextAppointments = nextApptSnap.docs.map(doc => {
      const d = doc.data()
      return {
        id:               doc.id,
        slotId:           d.slotId,
        slotDatetime:     (d.slotDatetime as Timestamp).toDate(),
        name:             d.name,
        email:            d.email,
        phone:            d.phone,
        notes:            d.notes,
        identificationUrl: d.identificationUrl,
        status:           d.status as AppointmentStatus,
        confirmationCode: d.confirmationCode,
        cancelToken:      d.cancelToken,
        reminder24Sent:   d.reminder24Sent,
        reminder2Sent:    d.reminder2Sent,
        googleCalendarEventId: d.googleCalendarEventId ?? null,
        createdAt:        (d.createdAt as Timestamp).toDate(),
      } satisfies Appointment
    })

    const totalAccepted = totalAcceptedSnap.data().count
    const totalRejected = totalRejectedSnap.data().count
    const decided       = totalAccepted + totalRejected

    return {
      stats: {
        totalPending:    pendingSnap.data().count,
        acceptedToday:   acceptedTodaySnap.data().count,
        totalAccepted,
        totalRejected,
        upcomingSlots:   upcomingSlotsSnap.data().count,
        conversion:      decided > 0 ? Math.round((totalAccepted / decided) * 100) : null,
        decided,
        nextAppointments,
      },
      error: false,
    }
  } catch (err) {
    // A metric query failing must never take down the whole dashboard.
    console.error('getStats failed, rendering empty dashboard:', err)
    return { stats: EMPTY_STATS, error: true }
  }
}

/**
 * Citas confirmadas que ya ocurrieron en las últimas 8 semanas, por semana
 * (lunes CDMX) y por asistencia. Misma forma de query que «Confirmadas hoy»
 * (status == accepted + rango de slotDatetime): no requiere índices nuevos.
 */
async function getWeekly(): Promise<{ weeks: WeekBucket[]; error: boolean }> {
  const now = new Date()
  const todayKey = formatInTimeZone(now, BUSINESS_TZ, 'yyyy-MM-dd')
  const thisMonday = weekStartKey(todayKey, Number(formatInTimeZone(now, BUSINESS_TZ, 'i')))
  const [y, m, d] = thisMonday.split('-').map(Number)
  const firstMonday = new Date(Date.UTC(y, m - 1, d - 7 * (WEEKS - 1))).toISOString().slice(0, 10)
  const weekKeys = Array.from({ length: WEEKS }, (_, i) => nextDayKeys(firstMonday, 7 * i + 1)[7 * i])
  try {
    const snap = await adminDb.collection('appointments')
      .where('status', '==', 'accepted')
      .where('slotDatetime', '>=', Timestamp.fromDate(fromZonedTime(`${firstMonday}T00:00:00`, BUSINESS_TZ)))
      .where('slotDatetime', '<',  Timestamp.fromDate(now))
      .select('slotDatetime', 'attended')
      .get()
    const rows = snap.docs.map(doc => {
      const dt = (doc.data().slotDatetime as Timestamp).toDate()
      const key = formatInTimeZone(dt, BUSINESS_TZ, 'yyyy-MM-dd')
      const attended = doc.data().attended
      return {
        weekKey: weekStartKey(key, Number(formatInTimeZone(dt, BUSINESS_TZ, 'i'))),
        attended: typeof attended === 'boolean' ? attended : null,
      }
    })
    return { weeks: bucketByWeek(weekKeys, rows), error: false }
  } catch (err) {
    console.error('getWeekly failed, rendering empty chart:', err)
    return { weeks: bucketByWeek(weekKeys, []), error: true }
  }
}

// Estados comerciales que ya no requieren seguimiento (ver lib/commercial).
const CLOSED_COMMERCIAL_STATUSES: CommercialStatus[] = ['purchased', 'not_purchased']

async function getOverdueFollowUps(): Promise<{ items: OverdueFollowUpItem[]; error: boolean }> {
  try {
    // Rango + orderBy sobre el mismo campo único (followUpAt) usa el índice
    // automático; el estado comercial se filtra en memoria para no requerir
    // un índice compuesto nuevo.
    const snap = await adminDb.collection('appointments')
      .where('followUpAt', '<=', Timestamp.fromDate(new Date()))
      .orderBy('followUpAt')
      .limit(40)
      .get()

    const items = snap.docs
      .map(doc => {
        const d = doc.data()
        return {
          id: doc.id,
          name: String(d.name ?? ''),
          followUpAt: (d.followUpAt as Timestamp).toDate(),
          commercialStatus: d.commercialStatus as CommercialStatus | undefined,
        }
      })
      .filter(item => !CLOSED_COMMERCIAL_STATUSES.includes(item.commercialStatus ?? 'pending'))
      .slice(0, 10)

    return { items, error: false }
  } catch (err) {
    console.error('getOverdueFollowUps failed, rendering empty list:', err)
    return { items: [], error: true }
  }
}

export default async function AdminDashboard() {
  const [statsResult, followUpsResult, weeklyResult] = await Promise.all([getStats(), getOverdueFollowUps(), getWeekly()])
  const { stats, error: statsError } = statsResult
  const { items: overdueFollowUps, error: followUpsError } = followUpsResult
  const hasError = statsError || followUpsError || weeklyResult.error
  const rate = attendanceRate(weeklyResult.weeks)
  const totalWeeks = weeklyResult.weeks.reduce((n, w) => n + w.attended + w.noShow + w.unmarked, 0)

  // Lo que pide acción ahora. «Sin horarios publicados» era antes «al día».
  const attention = statsError ? [] : [
    ...(stats.totalPending > 0 ? [{ href: '/admin/hoy', text: `${stats.totalPending} solicitud${stats.totalPending === 1 ? '' : 'es'} por decidir` }] : []),
    ...(stats.upcomingSlots === 0 ? [{ href: '/admin/slots', text: 'No hay horarios libres en los próximos 7 días' }] : []),
    ...(overdueFollowUps.length > 0 ? [{ href: '/admin/citas', text: `${overdueFollowUps.length} seguimiento${overdueFollowUps.length === 1 ? '' : 's'} vencido${overdueFollowUps.length === 1 ? '' : 's'}` }] : []),
  ]

  const figures = [
    { label: 'Confirmadas hoy', value: stats.acceptedToday },
    { label: 'Por decidir', value: stats.totalPending },
    { label: 'Horarios libres, 7 días', value: stats.upcomingSlots },
    { label: 'Aceptación', value: stats.conversion === null ? 'Sin datos' : `${stats.conversion}%`, hint: stats.decided > 0 ? `${stats.decided} decididas` : undefined },
  ]

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-serif text-display-sm font-light tracking-tight text-ink">Resumen</h1>
        <p className="mt-1 text-sm text-ink-muted">Lo que pide atención, cómo van las citas y quién viene.</p>
      </header>

      {hasError && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <AlertTriangle size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-amber-700" />
          <div>
            <p className="text-sm font-medium text-ink">No pudimos cargar algunos datos</p>
            <p className="text-sm text-ink-muted">Recarga la página para reintentar.</p>
          </div>
        </div>
      )}

      {!statsError && (
        <section aria-label="Requiere atención" className={cn('rounded-2xl border px-5 py-4', attention.length ? 'border-champagne-soft bg-champagne-tint/60' : 'border-admin-line bg-admin-panel')}>
          {attention.length === 0 ? (
            <p className="text-sm text-ink">Todo al día: sin solicitudes por decidir y con horarios publicados.</p>
          ) : (
            <ul className="divide-y divide-champagne-soft">
              {attention.map(item => (
                <li key={item.text}>
                  <Link href={item.href} className="flex min-h-[44px] items-center justify-between gap-3 py-1 text-sm font-medium text-ink hover:text-champagne-deep focus-visible:shadow-focus-ring">
                    {item.text}
                    <ArrowRight size={15} strokeWidth={1.5} className="shrink-0 text-champagne-deep" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Cifras en línea, separadas por filetes: sin tarjetas de métrica gigante. */}
      <dl className="grid grid-cols-2 gap-y-5 border-y border-admin-line py-5 lg:grid-cols-4 lg:divide-x lg:divide-admin-line">
        {figures.map(f => (
          <div key={f.label} className="px-1 lg:px-6 lg:first:pl-0">
            <dt className="text-xs text-ink-muted">{f.label}</dt>
            <dd className="mt-1 font-serif text-[2rem] font-light leading-none text-ink tabular-nums">
              {statsError ? <span className="font-sans text-sm text-ink-muted">Sin datos</span> : f.value}
              {f.hint && !statsError && <span className="ml-2 font-sans text-xs text-ink-muted">{f.hint}</span>}
            </dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="semanas" className="rounded-2xl border border-admin-line bg-admin-panel p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="semanas" className="font-serif text-xl font-light text-ink">Citas por semana</h2>
            <p className="text-sm text-ink-muted">
              {rate === null ? 'Aún no hay asistencias marcadas' : <>Asistencia <span className="font-medium text-ink">{rate}%</span> de las marcadas</>}
            </p>
          </div>
          <WeeklyAttendance weeks={weeklyResult.weeks} />
          {totalWeeks > 0 && (
            <p className="mt-3 text-xs text-ink-muted">
              Confirmadas que ya ocurrieron, últimas {WEEKS} semanas. «Sin marcar» son las que nadie registró en la Agenda.
            </p>
          )}
        </section>

        <div className="space-y-8">
          <section aria-labelledby="proximas">
            <h2 id="proximas" className="mb-3 font-serif text-xl font-light text-ink">Próximas citas</h2>
            <UpcomingList appointments={stats.nextAppointments} error={statsError} />
          </section>
          <section aria-labelledby="seguimientos">
            <h2 id="seguimientos" className="mb-3 font-serif text-xl font-light text-ink">
              Seguimientos vencidos <span className="font-sans text-sm text-ink-muted">{overdueFollowUps.length}</span>
            </h2>
            <OverdueFollowUpsList items={overdueFollowUps} error={followUpsError} />
          </section>
        </div>
      </div>
    </div>
  )
}
