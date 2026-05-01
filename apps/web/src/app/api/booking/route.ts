import { NextResponse, after } from 'next/server'
import { adminDb, adminStorage } from '@/lib/firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { bookingPayloadSchema } from '@/lib/schemas'
import { generateCode, sanitize } from '@/lib/utils'
import { sendBookingConfirmation } from '@/lib/email'
import { releaseExpiredHolds } from '@/lib/holds'
import type { Appointment } from '@/types'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB
const ALLOWED_MIME   = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
// Slot hold duration: pending appointments hold the slot for 30 minutes
const HOLD_MS = 30 * 60 * 1000

export async function POST(request: Request) {
  try {
    await releaseExpiredHolds()

    const formData = await request.formData()

    const raw = {
      slotId:   formData.get('slotId'),
      name:     formData.get('name'),
      email:    formData.get('email'),
      phone:    formData.get('phone'),
      notes:    formData.get('notes') ?? '',
      whatsapp: formData.get('whatsapp') === 'true',
    }

    const parsed = bookingPayloadSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 422 })
    }

    const idFile = formData.get('idFile') as File | null
    if (!idFile || idFile.size === 0) {
      return NextResponse.json({ error: 'Identificación requerida' }, { status: 422 })
    }
    if (idFile.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'El archivo no puede superar 5 MB' }, { status: 422 })
    }
    if (!ALLOWED_MIME.includes(idFile.type)) {
      return NextResponse.json({ error: 'Formato no permitido. Usa JPG, PNG, WebP o PDF.' }, { status: 422 })
    }

    const { slotId, name, email, phone, notes, whatsapp } = parsed.data

    // Upload ID first (outside transaction — idempotent with UUID path)
    const fileExt       = idFile.name.split('.').pop() ?? 'jpg'
    const storageKey    = `identifications/${randomUUID()}.${fileExt}`
    const fileBuffer    = Buffer.from(await idFile.arrayBuffer())
    const bucket        = adminStorage.bucket()
    const fileRef       = bucket.file(storageKey)
    await fileRef.save(fileBuffer, { contentType: idFile.type, resumable: false })
    // identificationUrl is the storage path; signed URLs generated on-demand in admin panel
    const identificationUrl = storageKey

    const confirmationCode = generateCode(8)
    const cancelToken      = generateCode(16)

    let appointmentId = ''
    let slotDatetime: Date | null = null

    // Firestore transaction: check availability, create appointment, hold slot
    await adminDb.runTransaction(async tx => {
      const slotRef  = adminDb.collection('slots').doc(slotId)
      const slotSnap = await tx.get(slotRef)

      if (!slotSnap.exists) throw new Error('SLOT_NOT_FOUND')

      const slotData = slotSnap.data()!
      slotDatetime   = (slotData.datetime as Timestamp).toDate()

      if (!slotData.available) throw new Error('SLOT_UNAVAILABLE')
      if (slotDatetime <= new Date()) throw new Error('SLOT_UNAVAILABLE')

      // Check for existing pending/accepted appointments on this slot.
      // Use tx.get(query) so the read participates in the transaction snapshot.
      const existingQuery = adminDb
        .collection('appointments')
        .where('slotId', '==', slotId)
        .where('status', 'in', ['pending', 'accepted'])
        .limit(1)
      const existingSnap = await tx.get(existingQuery)

      if (!existingSnap.empty) throw new Error('SLOT_UNAVAILABLE')

      const apptRef = adminDb.collection('appointments').doc()
      appointmentId = apptRef.id

      const heldUntil = new Date(Date.now() + HOLD_MS)

      tx.set(apptRef, {
        slotId,
        slotDatetime: Timestamp.fromDate(slotDatetime),
        name:         sanitize(name),
        email:        email.toLowerCase().trim(),
        phone:        phone.trim(),
        notes:        sanitize(notes ?? ''),
        whatsapp:     whatsapp ?? false,
        identificationUrl,
        status:           'pending',
        confirmationCode,
        cancelToken,
        reminder24Sent:   false,
        reminder2Sent:    false,
        createdAt:        FieldValue.serverTimestamp(),
        updatedAt:        FieldValue.serverTimestamp(),
      })

      tx.update(slotRef, {
        available: false,
        heldUntil: Timestamp.fromDate(heldUntil),
        bookedBy:  appointmentId,
      })
    })

    // Send emails async (don't fail the booking if email fails)
    const apptForEmail: Appointment = {
      id: appointmentId,
      slotId,
      slotDatetime: slotDatetime!,
      name:   sanitize(name),
      email:  email.toLowerCase().trim(),
      phone:  phone.trim(),
      notes:  sanitize(notes ?? ''),
      identificationUrl,
      status: 'pending',
      confirmationCode,
      cancelToken,
      reminder24Sent: false,
      reminder2Sent:  false,
      googleCalendarEventId: null,
      createdAt: new Date(),
    }

    after(sendBookingConfirmation(apptForEmail).catch(err =>
      console.error('Email send failed (non-fatal):', err)
    ))

    return NextResponse.json({ confirmationCode }, { status: 201 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    if (msg === 'SLOT_UNAVAILABLE' || msg === 'SLOT_NOT_FOUND') {
      return NextResponse.json({ error: 'Este horario ya no está disponible. Por favor selecciona otro.' }, { status: 409 })
    }
    console.error('POST /api/booking', err)
    return NextResponse.json({ error: 'Error al procesar tu solicitud' }, { status: 500 })
  }
}
