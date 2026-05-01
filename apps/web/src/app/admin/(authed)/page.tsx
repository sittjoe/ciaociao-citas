import type { Metadata } from 'next'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { StatsCards, UpcomingList } from '@/components/admin/StatsCards'
import type { AdminStats, Appointment, AppointmentStatus } from '@/types'

export const dynamic  = 'force-dynamic'
export const metadata: Metadata = { title: 'Dashboard' }

async function getStats(): Promise<AdminStats> {
  const now        = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd   = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
  const weekEnd    = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

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

  return {
    totalPending:    pendingSnap.data().count,
    acceptedToday:   acceptedTodaySnap.data().count,
    totalAccepted:   totalAcceptedSnap.data().count,
    totalRejected:   totalRejectedSnap.data().count,
    upcomingSlots:   upcomingSlotsSnap.data().count,
    nextAppointments,
  }
}

export default async function AdminDashboard() {
  const stats = await getStats()

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="font-serif text-2xl text-ink">Dashboard</h1>
        <p className="text-sm text-ink-muted mt-1">Resumen de la actividad del showroom</p>
      </div>

      <StatsCards stats={stats} />

      <div className="card-soft">
        <h2 className="font-serif text-lg text-ink mb-4">Próximas citas</h2>
        <UpcomingList appointments={stats.nextAppointments} />
      </div>
    </div>
  )
}
