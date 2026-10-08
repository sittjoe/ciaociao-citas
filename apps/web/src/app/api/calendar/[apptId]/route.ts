import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { normalizeAppointmentType } from '@/lib/commercial'
import { buildAppointmentICS } from '@/lib/ics'
import { icsOrganizerEmail } from '@/lib/email'

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

  // Mismo generador que el adjunto del correo (escapado RFC 5545, CN entre
  // comillas, líneas plegadas, SEQUENCE vigente de la cita).
  const ics = buildAppointmentICS({
    id: apptId,
    slotDatetime: (d.slotDatetime as Timestamp).toDate(),
    appointmentType: normalizeAppointmentType(d.appointmentType),
    name: String(d.name ?? 'Cliente'),
    email: String(d.email ?? ''),
    meetingUrl: d.meetingUrl ?? null,
    meetingInstructions: d.meetingInstructions ?? null,
    icsSequence: Number(d.icsSequence ?? 0) || 0,
  }, { method: 'REQUEST', organizerEmail: icsOrganizerEmail() })

  return new NextResponse(ics, {
    headers: {
      'Content-Type':        'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="cita-ciaociao.ics"`,
    },
  })
}
