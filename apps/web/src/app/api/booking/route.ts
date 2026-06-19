import { NextResponse, after } from 'next/server'
import { adminDb, adminStorage } from '@/lib/firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { z } from 'zod'
import { bookingPayloadSchema, guestInputSchema } from '@/lib/schemas'
import { generateCode, phoneDigits, sanitize } from '@/lib/utils'
import { isVideoEngagement, normalizeAppointmentType } from '@/lib/commercial'
import { sendBookingConfirmation, sendGuestInvitation } from '@/lib/email'
import { releaseExpiredHolds } from '@/lib/holds'
import { createSlotLock } from '@/lib/slot-locks'
import { logAppointmentEvent } from '@/lib/appointment-events'
import { checkPublicRateLimit, requestIp } from '@/lib/public-rate-limit'
import { getBlockedDateSet, businessDateKey } from '@/lib/blocked-dates'
import type { Appointment, Guest } from '@/types'
import { randomUUID, randomBytes } from 'crypto'

export const dynamic = 'force-dynamic'

const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB
type UploadedFileRef = { delete: () => Promise<unknown> }
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000
const ALLOWED_MIME   = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
// Slot hold duration: pending appointments hold the slot for 30 minutes
const HOLD_MS = 30 * 60 * 1000

export async function POST(request: Request) {
  let uploadedFileRef: UploadedFileRef | null = null
  let idempotencyRef: FirebaseFirestore.DocumentReference | null = null
  try {
    const contentType = request.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Solicitud inválida' }, { status: 415 })
    }
    const contentLength = Number(request.headers.get('content-length') ?? 0)
    if (contentLength > MAX_FILE_BYTES + 1_000_000) {
      return NextResponse.json({ error: 'La solicitud es demasiado grande' }, { status: 413 })
    }
    const ip = requestIp(request)
    if (await checkPublicRateLimit({ key: `booking:ip:${ip}`, windowMs: 60 * 60 * 1000, max: 10 })) {
      return NextResponse.json(
        { error: 'Demasiadas solicitudes. Intenta de nuevo en una hora.' },
        { status: 429, headers: { 'Retry-After': '3600' } },
      )
    }

    await releaseExpiredHolds()

    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return NextResponse.json({ error: 'Formulario inválido' }, { status: 400 })
    }

    const raw = {
      slotId:   formData.get('slotId'),
      appointmentType: formData.get('appointmentType') ?? 'showroom',
      name:     formData.get('name'),
      email:    formData.get('email'),
      phone:    formData.get('phone'),
      notes:    formData.get('notes') ?? '',
      productType: formData.get('productType') ?? '',
      budgetRange: formData.get('budgetRange') ?? '',
      lookingFor: formData.get('lookingFor') ?? '',
      engagementBrief: (() => {
        const rawBrief = formData.get('engagementBrief')
        if (!rawBrief) return undefined
        try { return JSON.parse(String(rawBrief)) } catch { return undefined }
      })(),
      whatsapp: formData.get('whatsapp') === 'true',
    }

    const parsed = bookingPayloadSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 422 })
    }

    const { slotId, appointmentType, name, email, phone, notes, productType, budgetRange, lookingFor, engagementBrief, whatsapp } = parsed.data
    const isVideo = isVideoEngagement(appointmentType)

    const idFile = formData.get('idFile') as File | null
    if (!isVideo && (!idFile || idFile.size === 0)) {
      return NextResponse.json({ error: 'Identificación requerida' }, { status: 422 })
    }
    if (idFile && idFile.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'El archivo no puede superar 5 MB' }, { status: 422 })
    }
    if (idFile && idFile.size > 0 && !ALLOWED_MIME.includes(idFile.type)) {
      return NextResponse.json({ error: 'Formato no permitido. Usa JPG, PNG, WebP o PDF.' }, { status: 422 })
    }

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

    if (isVideo && guestList.length > 0) {
      return NextResponse.json({ error: 'Las video consultas no admiten invitados en esta versión' }, { status: 422 })
    }

    if (guestList.length > 0) {
      const guestEmails = guestList.map(g => g.email.toLowerCase().trim())
      if (new Set(guestEmails).size < guestEmails.length) {
        return NextResponse.json({ error: 'Los invitados no pueden tener emails duplicados' }, { status: 422 })
      }
      if (guestEmails.includes(email.toLowerCase().trim())) {
        return NextResponse.json({ error: 'Un invitado no puede tener el mismo email que el titular' }, { status: 422 })
      }
    }

    const idempotencyKeyRaw = String(formData.get('idempotencyKey') ?? '').trim()
    const idempotencyKey = /^[a-zA-Z0-9_-]{16,80}$/.test(idempotencyKeyRaw) ? idempotencyKeyRaw : randomUUID()
    idempotencyRef = adminDb
      .collection('bookingIdempotency')
      .doc(`${email.toLowerCase().trim().replace(/[^\w.-]/g, '_').slice(0, 120)}_${idempotencyKey}`)

    try {
      await idempotencyRef.create({
        status: 'processing',
        email: email.toLowerCase().trim(),
        slotId,
        createdAtMs: Date.now(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    } catch {
      const existing = await idempotencyRef.get()
      const existingData = existing.data()
      if (
        existingData?.status === 'completed' &&
        typeof existingData.confirmationCode === 'string'
      ) {
        return NextResponse.json({ confirmationCode: existingData.confirmationCode, reused: true }, { status: 200 })
      }
      const createdAtMs = Number(existingData?.createdAtMs ?? 0)
      if (existingData?.status === 'processing' && Date.now() - createdAtMs < IDEMPOTENCY_TTL_MS) {
        return NextResponse.json({ error: 'Tu solicitud ya se está procesando. Revisa tu correo o intenta en unos minutos.' }, { status: 409 })
      }
      await idempotencyRef.set({
        status: 'processing',
        email: email.toLowerCase().trim(),
        slotId,
        createdAtMs: Date.now(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
    }

    let identificationUrl: string | null = null
    if (idFile && idFile.size > 0) {
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
      uploadedFileRef = fileRef
      // identificationUrl is the storage path; signed URLs generated on-demand in admin panel
      identificationUrl = storageKey
    }

    const confirmationCode = generateCode(8)
    // 32 chars over a 32-symbol alphabet = 160 bits — out of brute-force range
    // even without rate limiting. Cancel/confirm routes accept 16–64 chars so
    // older 16-char tokens keep working.
    const cancelToken      = generateCode(32)
    const normalizedPhone  = phone.trim()
    const normalizedPhoneDigits = phoneDigits(normalizedPhone)

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

    // Defense in depth: blocked-date slots are already hidden from the public
    // calendar, but re-check here. Fails open (empty set) so a blocked-dates
    // glitch never blocks a legitimate booking.
    const blockedDates = await getBlockedDateSet()

    // Firestore transaction: all reads first, then all writes atomically
    await adminDb.runTransaction(async tx => {
      const slotRef  = adminDb.collection('slots').doc(slotId)
      const slotSnap = await tx.get(slotRef)

      if (!slotSnap.exists) throw new Error('SLOT_NOT_FOUND')

      const slotData = slotSnap.data()!
      slotDatetime   = (slotData.datetime as Timestamp).toDate()
      const slotType = normalizeAppointmentType(slotData.slotType)

      if (!slotData.available) throw new Error('SLOT_UNAVAILABLE')
      if (blockedDates.has(businessDateKey(slotDatetime))) throw new Error('DATE_BLOCKED')
      if (slotType !== appointmentType) throw new Error('SLOT_TYPE_MISMATCH')
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

      const existingDatetimeQuery = adminDb
        .collection('appointments')
        .where('slotDatetime', '==', Timestamp.fromDate(slotDatetime))
        .where('status', 'in', ['pending', 'accepted'])
        .limit(1)
      const existingDatetimeSnap = await tx.get(existingDatetimeQuery)

      if (!existingDatetimeSnap.empty) throw new Error('SLOT_UNAVAILABLE')

      const heldUntil = new Date(Date.now() + HOLD_MS)

      createSlotLock(tx, slotDatetime, appointmentId)

      tx.set(apptRef, {
        slotId,
        slotDatetime: Timestamp.fromDate(slotDatetime),
        appointmentType,
        name:         sanitize(name),
        email:        email.toLowerCase().trim(),
        phone:        normalizedPhone,
        phoneDigits:  normalizedPhoneDigits,
        notes:        sanitize(notes ?? ''),
        productType:  sanitize(productType ?? ''),
        budgetRange:  sanitize(budgetRange ?? ''),
        lookingFor:   sanitize(lookingFor ?? ''),
        engagementBrief: {
          proposalTimeline: sanitize(engagementBrief?.proposalTimeline ?? ''),
          ringStage:        sanitize(engagementBrief?.ringStage ?? ''),
          metalPreference:  sanitize(engagementBrief?.metalPreference ?? ''),
          stonePreference:  sanitize(engagementBrief?.stonePreference ?? ''),
          ringSizeKnown:    sanitize(engagementBrief?.ringSizeKnown ?? ''),
          partnerStyle:     sanitize(engagementBrief?.partnerStyle ?? ''),
          referenceLinks:   sanitize(engagementBrief?.referenceLinks ?? ''),
        },
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

    await idempotencyRef.update({
      status: 'completed',
      appointmentId,
      confirmationCode,
      updatedAt: FieldValue.serverTimestamp(),
    }).catch(() => {})
    await logAppointmentEvent({
      appointmentId,
      action: 'booking_created',
      actor: 'client',
      summary: appointmentType === 'video_engagement_rings' ? 'Solicitud de video consulta creada' : 'Solicitud de showroom creada',
      metadata: { appointmentType },
    }).catch(err => console.error('Appointment event log failed:', err))

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
      appointmentType,
      name:   sanitize(name),
      email:  email.toLowerCase().trim(),
      phone:  normalizedPhone,
      notes:  sanitize(notes ?? ''),
      productType: sanitize(productType ?? ''),
      budgetRange: sanitize(budgetRange ?? ''),
      lookingFor:  sanitize(lookingFor ?? ''),
      engagementBrief: {
        proposalTimeline: sanitize(engagementBrief?.proposalTimeline ?? ''),
        ringStage:        sanitize(engagementBrief?.ringStage ?? ''),
        metalPreference:  sanitize(engagementBrief?.metalPreference ?? ''),
        stonePreference:  sanitize(engagementBrief?.stonePreference ?? ''),
        ringSizeKnown:    sanitize(engagementBrief?.ringSizeKnown ?? ''),
        partnerStyle:     sanitize(engagementBrief?.partnerStyle ?? ''),
        referenceLinks:   sanitize(engagementBrief?.referenceLinks ?? ''),
      },
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
    if (uploadedFileRef) {
      await uploadedFileRef.delete().catch(deleteErr => {
        console.error('Failed to cleanup uploaded ID after booking error:', deleteErr)
      })
    }
    if (idempotencyRef) {
      await idempotencyRef.update({
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
        updatedAt: FieldValue.serverTimestamp(),
      }).catch(() => {})
    }
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    if (msg === 'SLOT_UNAVAILABLE' || msg === 'SLOT_NOT_FOUND' || msg === 'DATE_BLOCKED') {
      return NextResponse.json({ error: 'Este horario ya no está disponible. Por favor selecciona otro.' }, { status: 409 })
    }
    if (msg === 'SLOT_TYPE_MISMATCH') {
      return NextResponse.json({ error: 'Este horario no corresponde al tipo de cita seleccionado.' }, { status: 409 })
    }
    if (typeof (err as { code?: unknown })?.code === 'number' && (err as { code?: number }).code === 6) {
      return NextResponse.json({ error: 'Este horario ya no está disponible. Por favor selecciona otro.' }, { status: 409 })
    }
    if (msg === 'GUESTS_TOO_LATE') {
      return NextResponse.json({ error: 'No es posible agregar invitados a citas con menos de 24h de anticipación' }, { status: 422 })
    }
    console.error('POST /api/booking', err)
    return NextResponse.json({ error: 'Error al procesar tu solicitud' }, { status: 500 })
  }
}
