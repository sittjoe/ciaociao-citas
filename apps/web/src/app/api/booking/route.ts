import { NextResponse, after } from 'next/server'
import { adminDb, adminStorage } from '@/lib/firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { z } from 'zod'
import { bookingPayloadSchema, guestInputSchema } from '@/lib/schemas'
import { generateCode, sanitize } from '@/lib/utils'
import { sendBookingConfirmation, sendGuestInvitation } from '@/lib/email'
import { releaseExpiredHolds } from '@/lib/holds'
import type { Appointment, Guest } from '@/types'
import { randomUUID, randomBytes } from 'crypto'

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

    // Parse optional guests array (JSON-encoded in FormData)
    const guestsRaw    = formData.get('guests')
    const guestsParsed = (() => {
      if (!guestsRaw) return { success: true as const, data: [] }
      try {
        return z.array(guestInputSchema).max(3).safeParse(JSON.parse(String(guestsRaw)))
      } catch {
        return { success: false as const }
      }
    })()
    if (!guestsParsed.success) {
      return NextResponse.json({ error: 'Datos de invitados inválidos' }, { status: 422 })
    }
    const guestList = guestsParsed.data

    if (guestList.length > 0) {
      const guestEmails = guestList.map(g => g.email.toLowerCase().trim())
      if (new Set(guestEmails).size < guestEmails.length) {
        return NextResponse.json({ error: 'Los invitados no pueden tener emails duplicados' }, { status: 422 })
      }
      if (guestEmails.includes(email.toLowerCase().trim())) {
        return NextResponse.json({ error: 'Un invitado no puede tener el mismo email que el titular' }, { status: 422 })
      }
    }

    // Upload ID first (outside transaction — idempotent with UUID path)
    const extByMime: Record<string, string> = {
      'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf',
    }
    const fileExt       = extByMime[idFile.type] ?? 'bin'
    const storageKey    = `identifications/${randomUUID()}.${fileExt}`
    const fileBuffer    = Buffer.from(await idFile.arrayBuffer())
    const bucket        = adminStorage.bucket()
    const fileRef       = bucket.file(storageKey)
    await fileRef.save(fileBuffer, { contentType: idFile.type, resumable: false })
    // identificationUrl is the storage path; signed URLs generated on-demand in admin panel
    const identificationUrl = storageKey

    const confirmationCode = generateCode(8)
    const cancelToken      = generateCode(16)

    // Pre-generate refs and tokens before the transaction so all writes are atomic
    const apptRef      = adminDb.collection('appointments').doc()
    const appointmentId = apptRef.id
    let   slotDatetime: Date | null = null

    const guestEntries = guestList.map(g => ({
      ref:         apptRef.collection('guests').doc(),
      verifyToken: randomBytes(32).toString('hex'),
      name:        sanitize(g.name.trim()),
      email:       g.email.toLowerCase().trim(),
    }))

    // Firestore transaction: all reads first, then all writes atomically
    await adminDb.runTransaction(async tx => {
      const slotRef  = adminDb.collection('slots').doc(slotId)
      const slotSnap = await tx.get(slotRef)

      if (!slotSnap.exists) throw new Error('SLOT_NOT_FOUND')

      const slotData = slotSnap.data()!
      slotDatetime   = (slotData.datetime as Timestamp).toDate()

      if (!slotData.available) throw new Error('SLOT_UNAVAILABLE')
      if (slotDatetime <= new Date()) throw new Error('SLOT_UNAVAILABLE')

      // Guests require at least 24h for verification before the appointment
      if (guestList.length > 0) {
        const guestDeadline = new Date(slotDatetime.getTime() - 24 * 60 * 60 * 1000)
        if (guestDeadline <= new Date()) throw new Error('GUESTS_TOO_LATE')
      }

      // Read participates in transaction snapshot to catch concurrent bookings
      const existingQuery = adminDb
        .collection('appointments')
        .where('slotId', '==', slotId)
        .where('status', 'in', ['pending', 'accepted'])
        .limit(1)
      const existingSnap = await tx.get(existingQuery)

      if (!existingSnap.empty) throw new Error('SLOT_UNAVAILABLE')

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
        status:              'pending',
        confirmationCode,
        cancelToken,
        reminder24Sent:      false,
        reminder2Sent:       false,
        guestCount:          guestList.length,
        guestsAllVerified:   guestList.length === 0,
        createdAt:           FieldValue.serverTimestamp(),
        updatedAt:           FieldValue.serverTimestamp(),
      })

      tx.update(slotRef, {
        available: false,
        heldUntil: Timestamp.fromDate(heldUntil),
        bookedBy:  appointmentId,
      })

      // Guest subdocs created atomically with the appointment
      for (const g of guestEntries) {
        tx.set(g.ref, {
          appointmentId,
          name:              g.name,
          email:             g.email,
          status:            'pending',
          verifyToken:       g.verifyToken,
          identificationUrl: null,
          invitedAt:         FieldValue.serverTimestamp(),
          verifiedAt:        null,
          expiredAt:         null,
          excludedAt:        null,
          excludedBy:        null,
          reminder48Sent:    false,
          reminder24Sent:    false,
        })
      }
    })

    // Build Guest objects from pre-generated entries (transaction committed)
    const createdGuests: Guest[] = guestEntries.map(g => ({
      id:                g.ref.id,
      appointmentId,
      name:              g.name,
      email:             g.email,
      status:            'pending' as const,
      verifyToken:       g.verifyToken,
      identificationUrl: null,
      invitedAt:         new Date(),
      verifiedAt:        null,
      expiredAt:         null,
      excludedAt:        null,
      excludedBy:        null,
      reminder48Sent:    false,
      reminder24Sent:    false,
    }))

    if (!slotDatetime) throw new Error('UNREACHABLE: slotDatetime not set')

    const apptForEmail: Appointment = {
      id: appointmentId,
      slotId,
      slotDatetime,
      name:   sanitize(name),
      email:  email.toLowerCase().trim(),
      phone:  phone.trim(),
      notes:  sanitize(notes ?? ''),
      identificationUrl,
      status:            'pending',
      confirmationCode,
      cancelToken,
      reminder24Sent:    false,
      reminder2Sent:     false,
      guestCount:        guestList.length,
      guestsAllVerified: guestList.length === 0,
      googleCalendarEventId: null,
      createdAt: new Date(),
    }

    after(async () => {
      try {
        await sendBookingConfirmation(apptForEmail, createdGuests.map(g => g.name))
      } catch (err) {
        console.error('Booking email failed (non-fatal):', err)
      }
      for (const g of createdGuests) {
        try {
          await sendGuestInvitation({ guest: g, appointment: apptForEmail, hostName: apptForEmail.name })
        } catch (err) {
          console.error(`Guest invitation email failed for ${g.email} (non-fatal):`, err)
        }
      }
    })

    return NextResponse.json({ confirmationCode }, { status: 201 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    if (msg === 'SLOT_UNAVAILABLE' || msg === 'SLOT_NOT_FOUND') {
      return NextResponse.json({ error: 'Este horario ya no está disponible. Por favor selecciona otro.' }, { status: 409 })
    }
    if (msg === 'GUESTS_TOO_LATE') {
      return NextResponse.json({ error: 'No es posible agregar invitados a citas con menos de 24h de anticipación' }, { status: 422 })
    }
    console.error('POST /api/booking', err)
    return NextResponse.json({ error: 'Error al procesar tu solicitud' }, { status: 500 })
  }
}
