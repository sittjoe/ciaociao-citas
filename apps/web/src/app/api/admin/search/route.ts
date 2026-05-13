import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { requireAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

interface AppointmentHit {
  type: 'appointment'
  id: string
  title: string
  subtitle: string
  href: string
  status?: string
}

interface SlotHit {
  type: 'slot'
  id: string
  title: string
  subtitle: string
  href: string
}

interface GuestHit {
  type: 'guest'
  id: string
  appointmentId: string
  title: string
  subtitle: string
  href: string
}

type Hit = AppointmentHit | SlotHit | GuestHit

const MAX_PER_KIND = 6

function lower(v: unknown): string {
  return String(v ?? '').toLowerCase()
}

function formatSlotDate(d: Date): string {
  return d.toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export async function GET(request: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const qRaw = (searchParams.get('q') ?? '').trim()
  if (qRaw.length < 2) {
    return NextResponse.json({ hits: [] satisfies Hit[] })
  }
  const q = qRaw.toLowerCase()

  try {
    // Pull a small page from each collection — Firestore lacks full-text, so we
    // filter client-side after capping the scan with `limit`.  This is fine for
    // a single-tenant admin tool.
    const [apptSnap, slotSnap, guestSnap] = await Promise.all([
      adminDb.collection('appointments')
        .orderBy('createdAt', 'desc')
        .limit(80)
        .get(),
      adminDb.collection('slots')
        .where('datetime', '>=', Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)))
        .orderBy('datetime', 'asc')
        .limit(60)
        .get(),
      adminDb.collectionGroup('guests')
        .orderBy('invitedAt', 'desc')
        .limit(60)
        .get()
        .catch(() => null),
    ])

    const hits: Hit[] = []

    for (const doc of apptSnap.docs) {
      const d = doc.data()
      const haystack = `${lower(d.name)} ${lower(d.email)} ${lower(d.phone)} ${lower(d.confirmationCode)}`
      if (!haystack.includes(q)) continue
      const date = (d.slotDatetime as Timestamp | undefined)?.toDate()
      hits.push({
        type: 'appointment',
        id: doc.id,
        title: String(d.name ?? 'Sin nombre'),
        subtitle: [d.email, date ? formatSlotDate(date) : null].filter(Boolean).join(' · '),
        href: '/admin/citas',
        status: String(d.status ?? ''),
      })
      if (hits.filter(h => h.type === 'appointment').length >= MAX_PER_KIND) break
    }

    for (const doc of slotSnap.docs) {
      const d = doc.data()
      const date = (d.datetime as Timestamp | undefined)?.toDate()
      if (!date) continue
      const formatted = formatSlotDate(date)
      if (!formatted.toLowerCase().includes(q) && !doc.id.toLowerCase().includes(q)) continue
      hits.push({
        type: 'slot',
        id: doc.id,
        title: formatted,
        subtitle: d.available === false
          ? d.bookedBy
            ? `Reservado · ${String(d.bookedBy).slice(0, 18)}`
            : 'No disponible'
          : 'Disponible',
        href: '/admin/slots',
      })
      if (hits.filter(h => h.type === 'slot').length >= MAX_PER_KIND) break
    }

    if (guestSnap) {
      for (const doc of guestSnap.docs) {
        const d = doc.data()
        const haystack = `${lower(d.name)} ${lower(d.email)}`
        if (!haystack.includes(q)) continue
        // appointmentId lives either in field or as the parent doc id.
        const apptId =
          typeof d.appointmentId === 'string'
            ? d.appointmentId
            : doc.ref.parent.parent?.id ?? ''
        hits.push({
          type: 'guest',
          id: doc.id,
          appointmentId: apptId,
          title: String(d.name ?? 'Invitado'),
          subtitle: `Invitado · ${String(d.email ?? '')}`,
          href: '/admin/citas',
        })
        if (hits.filter(h => h.type === 'guest').length >= MAX_PER_KIND) break
      }
    }

    return NextResponse.json({ hits })
  } catch (err) {
    console.error('GET /api/admin/search', err)
    return NextResponse.json({ error: 'Error al buscar' }, { status: 500 })
  }
}
