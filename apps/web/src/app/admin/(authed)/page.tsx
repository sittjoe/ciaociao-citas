import type { Metadata } from 'next'
import { AlertTriangle } from 'lucide-react'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { StatsCards, UpcomingList, OverdueFollowUpsList, type OverdueFollowUpItem } from '@/components/admin/StatsCards'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import type { AdminStats, Appointment, AppointmentStatus, CommercialStatus } from '@/types'

export const dynamic  = 'force-dynamic'
export const metadata: Metadata = { title: 'Dashboard' }

const EMPTY_STATS: AdminStats = {
  totalPending: 0, acceptedToday: 0, totalAccepted: 0, totalRejected: 0,
  upcomingSlots: 0, conversion: null, decided: 0, nextAppointments: [],
}

async function getStats(): Promise<{ stats: AdminStats; error: boolean }> {
  const now        = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd   = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
  const weekEnd    = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  try {
    // All of these use single-field equality or existing composite indexes.
    // Conversion is derived from the accepted/rejected totals below — no extra
    // query, so it can't depend on an index that isn't deployed.
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
  const [statsResult, followUpsResult] = await Promise.all([getStats(), getOverdueFollowUps()])
  const { stats, error: statsError } = statsResult
  const { items: overdueFollowUps, error: followUpsError } = followUpsResult
  const hasError = statsError || followUpsError
  const needsAttention = stats.totalPending + stats.upcomingSlots === 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="h-eyebrow mb-2">Operación</p>
          <h1 className="font-serif text-display-sm font-light tracking-tight text-ink">Dashboard</h1>
          <p className="text-sm text-ink-muted mt-1">Pendientes, próximos horarios y citas confirmadas.</p>
        </div>
        <div className="shrink-0 self-start rounded-xl border border-admin-line bg-admin-panel px-4 py-2.5 text-left lg:self-auto lg:text-right">
          <p className="h-eyebrow">Pendientes</p>
          <p className="mt-0.5 font-serif text-xl font-light leading-none text-ink">
            <span className="tabular-nums">{statsError ? '—' : stats.totalPending}</span>
            <span className="ml-1.5 align-middle font-sans text-xs font-normal text-ink-subtle">
              {statsError ? 'sin datos' : needsAttention ? 'al día' : 'por revisar'}
            </span>
          </p>
        </div>
      </div>

      {hasError && (
        <Card variant="admin" className="flex items-start gap-3 border-amber-200 bg-amber-50/60 p-4">
          <AlertTriangle size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-medium text-ink">No pudimos cargar algunos datos</p>
            <p className="text-sm text-ink-muted">Recarga la página para reintentar.</p>
          </div>
        </Card>
      )}

      <StatsCards stats={stats} />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card variant="admin">
        <CardHeader>
          <h2 className="font-serif text-lg font-light text-ink">Próximas citas</h2>
        </CardHeader>
        <CardBody className="pt-0">
          <UpcomingList appointments={stats.nextAppointments} error={statsError} />
        </CardBody>
      </Card>

      <div className="space-y-4">
      <Card variant="admin">
        <CardHeader>
          <h2 className="font-serif text-lg font-light text-ink">
            Seguimientos vencidos ({overdueFollowUps.length})
          </h2>
        </CardHeader>
        <CardBody className="pt-0">
          <OverdueFollowUpsList items={overdueFollowUps} error={followUpsError} />
        </CardBody>
      </Card>

      <Card variant="admin" className="p-5">
        <p className="h-eyebrow mb-4">Atención rápida</p>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between border-b border-admin-line pb-3">
            <span className="text-ink-muted">Pendientes</span>
            <span className="font-medium text-amber-700">{stats.totalPending}</span>
          </div>
          <div className="flex items-center justify-between border-b border-admin-line pb-3">
            <span className="text-ink-muted">Hoy</span>
            <span className="font-medium text-emerald-700">{stats.acceptedToday}</span>
          </div>
          <div className="flex items-center justify-between border-b border-admin-line pb-3">
            <span className="text-ink-muted">Slots 7 días</span>
            <span className="font-medium text-champagne-deep">{stats.upcomingSlots}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-muted">Conversión</span>
            <span className="font-medium text-ink">
              {stats.conversion === null ? '—' : `${stats.conversion}%`}
              <span className="ml-1.5 text-[0.7rem] font-normal text-ink-subtle">
                {stats.decided > 0 ? `(${stats.decided} decididas)` : 'sin decisiones'}
              </span>
            </span>
          </div>
        </div>
      </Card>
      </div>
      </div>
    </div>
  )
}
