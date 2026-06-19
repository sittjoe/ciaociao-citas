import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { attendanceSchema } from '@/lib/schemas'
import { requireAdminSession } from '@/lib/admin-auth'
import { logAppointmentEvent } from '@/lib/appointment-events'

export const dynamic = 'force-dynamic'

// Mark whether the client showed up. Only meaningful for accepted appointments;
// no-shows are excluded from conversion metrics and surfaced in the table.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const parsed = attendanceSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 422 })
  }

  const apptRef = adminDb.collection('appointments').doc(id)
  const snap = await apptRef.get()
  if (!snap.exists) return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
  if (snap.data()!.status !== 'accepted') {
    return NextResponse.json({ error: 'Solo se puede registrar asistencia en citas confirmadas' }, { status: 409 })
  }

  const { attended } = parsed.data
  await apptRef.update({
    attended,
    attendedAt: FieldValue.serverTimestamp(),
    attendedBy: admin.email,
    updatedAt: FieldValue.serverTimestamp(),
  })

  await adminDb.collection('auditLog').add({
    action: attended ? 'marked_attended' : 'marked_no_show',
    appointmentId: id,
    actorEmail: admin.email,
    ts: new Date(),
  }).catch(() => {})
  await logAppointmentEvent({
    appointmentId: id,
    action: attended ? 'marked_attended' : 'marked_no_show',
    actor: admin.email,
    summary: attended ? 'Cliente asistió' : 'Cliente no se presentó',
  }).catch(err => console.error('Appointment event log failed:', err))

  return NextResponse.json({ ok: true, attended })
}
