import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { clientRequestSchema } from '@/lib/schemas'
import { createClientRequest, NotesErrorCode } from '@/lib/notes'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params
  if (!code) {
    return NextResponse.json({ error: 'Código requerido' }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  const parsed = clientRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
  }

  try {
    const snap = await adminDb
      .collection('appointments')
      .where('confirmationCode', '==', code.toUpperCase())
      .limit(1)
      .get()

    if (snap.empty) {
      return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
    }

    const doc = snap.docs[0]
    const data = doc.data()
    if (data.status === 'cancelled' || data.status === 'rejected') {
      return NextResponse.json(
        { error: 'Esta cita ya no está activa' },
        { status: 409 },
      )
    }

    await createClientRequest({
      appointmentId: doc.id,
      action: parsed.data.action,
      reason: parsed.data.reason ?? null,
    })

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : ''
    if (msg === NotesErrorCode.APPT_NOT_FOUND) {
      return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
    }
    console.error(`POST /api/reserva/${code}/request`, err)
    return NextResponse.json(
      { error: 'No fue posible registrar tu solicitud' },
      { status: 500 },
    )
  }
}
