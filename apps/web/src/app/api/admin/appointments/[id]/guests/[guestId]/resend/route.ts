import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { requireAdminSession } from '@/lib/admin-auth'
import { mapAppointmentForEmail } from '@/lib/appointment-email'
import { sendGuestInvitation } from '@/lib/email'
import { checkPublicRateLimit } from '@/lib/public-rate-limit'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; guestId: string }> },
) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id, guestId } = await params

  // Cap resends so an invited guest can't be spammed (accidental or abusive)
  if (await checkPublicRateLimit({ key: `guest-resend:${guestId}`, windowMs: 60 * 60 * 1000, max: 3 })) {
    return NextResponse.json({ error: 'Demasiados reenvíos para este invitado. Intenta más tarde.' }, { status: 429 })
  }

  try {
    const apptRef = adminDb.collection('appointments').doc(id)
    const [apptSnap, guestSnap] = await Promise.all([
      apptRef.get(),
      apptRef.collection('guests').doc(guestId).get(),
    ])

    if (!apptSnap.exists) return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
    if (!guestSnap.exists) return NextResponse.json({ error: 'Invitado no encontrado' }, { status: 404 })

    const guest = guestSnap.data()!
    if (guest.status !== 'pending' || !guest.verifyToken) {
      return NextResponse.json({ error: 'El invitado no tiene una invitación activa' }, { status: 409 })
    }

    const appointment = mapAppointmentForEmail(apptSnap.id, apptSnap.data()!)
    await sendGuestInvitation({
      guest: {
        id: guestSnap.id,
        name: guest.name,
        email: guest.email,
        verifyToken: guest.verifyToken,
      },
      appointment,
      hostName: appointment.name,
    })

    await adminDb.collection('auditLog').add({
      action: 'resend_guest_invitation',
      appointmentId: id,
      guestId,
      actorEmail: admin.email,
      ts: new Date(),
    }).catch(() => {})

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error(`POST /api/admin/appointments/${id}/guests/${guestId}/resend`, err)
    return NextResponse.json({ error: 'No se pudo reenviar la invitación' }, { status: 500 })
  }
}
