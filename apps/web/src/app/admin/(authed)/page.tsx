import type { Metadata } from 'next'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { StatsCards, UpcomingList } from '@/components/admin/StatsCards'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import type { AdminStats, Appointment, AppointmentStatus } from '@/types'

export const dynamic  = 'force-dynamic'
export const metadata: Metadata = { title: 'Dashboard' }

async function getStats(): Promise<AdminStats> {
  const now        = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd   = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
  const weekEnd    = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const monthAgo   = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const [pendingSnap, acceptedTodaySnap, totalAcceptedSnap, totalRejectedSnap, upcomingSlotsSnap,
         accepted30Snap, rejected30Snap, nextApptSnap] =
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
      // 30-day conversion uses the existing status+createdAt composite index
      adminDb.collection('appointments')
        .where('status', '==', 'accepted')
        .where('createdAt', '>=', Timestamp.fromDate(monthAgo))
        .count().get(),
      adminDb.collection('appointments')
        .where('status', '==', 'rejected')
        .where('createdAt', '>=', Timestamp.fromDate(monthAgo))
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

  const accepted30 = accepted30Snap.data().count
  const rejected30 = rejected30Snap.data().count
  const decided30  = accepted30 + rejected30

  return {
    totalPending:    pendingSnap.data().count,
    acceptedToday:   acceptedTodaySnap.data().count,
    totalAccepted:   totalAcceptedSnap.data().count,
    totalRejected:   totalRejectedSnap.data().count,
    upcomingSlots:   upcomingSlotsSnap.data().count,
    conversion30d:   decided30 > 0 ? Math.round((accepted30 / decided30) * 100) : null,
    decided30d:      decided30,
    nextAppointments,
  }
}

export default async function AdminDashboard() {
  const stats = await getStats()
  const needsAttention = stats.totalPending + stats.upcomingSlots === 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="h-eyebrow mb-2">Operación</p>
          <h1 className="font-serif text-display-sm font-light tracking-tight text-ink">Dashboard</h1>
          <p className="text-sm text-ink-muted mt-1">Pendientes, próximos horarios y citas confirmadas.</p>
        </div>
        <div className="rounded-xl border border-admin-line bg-admin-panel px-4 py-3 text-xs text-ink-muted">
          {needsAttention ? 'Sin pendientes ni slots próximos' : `${stats.totalPending} pendiente${stats.totalPending === 1 ? '' : 's'} por revisar`}
        </div>
      </div>

      <StatsCards stats={stats} />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card variant="admin">
        <CardHeader>
          <h2 className="font-serif text-lg font-light text-ink">Próximas citas</h2>
        </CardHeader>
        <CardBody className="pt-0">
          <UpcomingList appointments={stats.nextAppointments} />
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
            <span className="text-ink-muted">Conversión 30 días</span>
            <span className="font-medium text-ink">
              {stats.conversion30d === null
                ? '—'
                : `${stats.conversion30d}%`}
              <span className="ml-1.5 text-[0.7rem] font-normal text-ink-subtle">
                {stats.decided30d > 0 ? `(${stats.decided30d} decididas)` : 'sin decisiones'}
              </span>
            </span>
          </div>
        </div>
      </Card>
      </div>
    </div>
  )
}
