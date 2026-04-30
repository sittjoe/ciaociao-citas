import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ apptId: string }> }
) {
  const { apptId } = await params

  const snap = await adminDb.collection('appointments').doc(apptId).get()
  if (!snap.exists) return new NextResponse('Not found', { status: 404 })

  const d     = snap.data()!
  const start = (d.slotDatetime as Timestamp).toDate()
  const end   = new Date(start.getTime() + 60 * 60 * 1000)
  const fmt   = (dt: Date) => dt.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const ADMIN = process.env.ADMIN_EMAIL ?? 'info@ciaociao.mx'

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CiaoCiao//Citas//ES',
    'BEGIN:VEVENT',
    `UID:${apptId}@ciaociao.mx`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    'SUMMARY:Cita en Ciao Ciao Joyería',
    'DESCRIPTION:Tu cita personalizada en el showroom privado de Ciao Ciao Joyería.',
    'LOCATION:Showroom Ciao Ciao Joyería',
    `ORGANIZER;CN=Ciao Ciao Joyería:mailto:${ADMIN}`,
    `ATTENDEE;CN=${d.name}:mailto:${d.email}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')

  return new NextResponse(ics, {
    headers: {
      'Content-Type':        'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="cita-ciaociao.ics"`,
    },
  })
}
