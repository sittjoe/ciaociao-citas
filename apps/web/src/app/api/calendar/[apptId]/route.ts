import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { formatInTimeZone } from 'date-fns-tz'
import { BUSINESS_TZ } from '@/lib/utils'
import { isVideoEngagement } from '@/lib/commercial'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ apptId: string }> }
) {
  const { apptId } = await params
  const code = new URL(request.url).searchParams.get('code')?.trim().toUpperCase()
  if (!code) return new NextResponse('Not found', { status: 404 })

  const snap = await adminDb.collection('appointments').doc(apptId).get()
  if (!snap.exists) return new NextResponse('Not found', { status: 404 })

  const d        = snap.data()!
  if (String(d.confirmationCode ?? '').toUpperCase() !== code) return new NextResponse('Not found', { status: 404 })
  if (d.status !== 'accepted') return new NextResponse('Calendar unavailable', { status: 409 })
  const start    = (d.slotDatetime as Timestamp).toDate()
  const end      = new Date(start.getTime() + 60 * 60 * 1000)
  const fmtLocal = (dt: Date) => formatInTimeZone(dt, BUSINESS_TZ, "yyyyMMdd'T'HHmmss")
  const dtstamp  = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const ADMIN    = process.env.ADMIN_EMAIL ?? 'info@ciaociao.mx'
  const isVideo = isVideoEngagement(d.appointmentType)
  const meetingUrl = String(d.meetingUrl ?? '').trim()
  const escapeIcs = (value: string) => value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
  const description = isVideo
    ? [
        'Video consulta para anillo de compromiso en Ciao Ciao Joyería.',
        meetingUrl ? `Link: ${meetingUrl}` : 'Link pendiente por enviar.',
        d.meetingInstructions ? `Indicaciones: ${d.meetingInstructions}` : '',
      ].filter(Boolean).join('\n')
    : 'Tu cita personalizada en el showroom privado de Ciao Ciao Joyería.'
  const location = isVideo ? (meetingUrl || 'Videollamada') : 'Showroom Ciao Ciao Joyería'
  const summary = isVideo ? 'Video consulta Ciao Ciao' : 'Cita en Ciao Ciao Joyería'

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CiaoCiao//Citas//ES',
    'METHOD:REQUEST',
    'BEGIN:VTIMEZONE',
    `TZID:${BUSINESS_TZ}`,
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZNAME:CST',
    'TZOFFSETFROM:-0600',
    'TZOFFSETTO:-0600',
    'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:${apptId}@ciaociao.mx`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;TZID=${BUSINESS_TZ}:${fmtLocal(start)}`,
    `DTEND;TZID=${BUSINESS_TZ}:${fmtLocal(end)}`,
    `SUMMARY:${escapeIcs(summary)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    `LOCATION:${escapeIcs(location)}`,
    `ORGANIZER;CN=Ciao Ciao Joyería:mailto:${ADMIN}`,
    `ATTENDEE;RSVP=TRUE;CN=${escapeIcs(String(d.name ?? 'Cliente'))}:mailto:${d.email}`,
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
