import { NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { cookies } from 'next/headers'
import { appointmentDecisionSchema } from '@/lib/schemas'
import { sendStatusUpdate } from '@/lib/email'
import type { Appointment } from '@/types'

export const dynamic = 'force-dynamic'

async function verifyAdmin(): Promise<boolean> {
  const cookieStore = await cookies()
  const session     = cookieStore.get('__session')?.value
  if (!session) return false
  try {
    const decoded = await adminAuth.verifySessionCookie(session, true)
    return decoded.admin === true
  } catch {
    return false
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { id } = await params
  const body   = await request.json()

  const parsed = appointmentDecisionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
  }

  const { action, reason } = parsed.data

  try {
    let appointment: Appointment | null = null

    await adminDb.runTransaction(async tx => {
      const apptRef  = adminDb.collection('appointments').doc(id)
      const apptSnap = await tx.get(apptRef)

      if (!apptSnap.exists) throw new Error('NOT_FOUND')

      const apptData = apptSnap.data()!
      if (apptData.status !== 'pending') throw new Error('ALREADY_PROCESSED')

      const newStatus = action === 'accept' ? 'accepted' : 'rejected'

      tx.update(apptRef, {
        status:    newStatus,
        updatedAt: FieldValue.serverTimestamp(),
        ...(reason ? { adminNote: reason } : {}),
      })

      // If rejecting, free the slot
      if (action === 'reject') {
        const slotRef = adminDb.collection('slots').doc(apptData.slotId)
        tx.update(slotRef, {
          available: true,
          heldUntil: null,
          bookedBy:  null,
        })
      }

      appointment = {
        id,
        slotId:           apptData.slotId,
        slotDatetime:     (apptData.slotDatetime as Timestamp).toDate(),
        name:             apptData.name,
        email:            apptData.email,
        phone:            apptData.phone,
        notes:            apptData.notes,
        identificationUrl: apptData.identificationUrl,
        status:           newStatus,
        confirmationCode: apptData.confirmationCode,
        cancelToken:      apptData.cancelToken,
        reminder24Sent:   apptData.reminder24Sent ?? false,
        reminder2Sent:    apptData.reminder2Sent  ?? false,
        createdAt:        (apptData.createdAt as Timestamp).toDate(),
      }
    })

    // Send email async
    if (appointment) {
      sendStatusUpdate(appointment, action, reason).catch(err =>
        console.error('Status email failed (non-fatal):', err)
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : ''
    if (msg === 'NOT_FOUND')         return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
    if (msg === 'ALREADY_PROCESSED') return NextResponse.json({ error: 'Esta cita ya fue procesada' }, { status: 409 })
    console.error(`POST /api/admin/appointments/${id}/decision`, err)
    return NextResponse.json({ error: 'Error al procesar la decisión' }, { status: 500 })
  }
}
