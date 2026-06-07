import { NextResponse } from 'next/server'
import { adminDb, adminStorage } from '@/lib/firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { formatDate, formatTime } from '@/lib/utils'
import { recomputeGuestsAllVerified } from '@/lib/guests'
import { randomUUID } from 'node:crypto'

export const dynamic = 'force-dynamic'

const MAX_FILE_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME   = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
type GuestDoc = FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>

async function findGuest(token: string) {
  if (!token) return null
  const snap = await adminDb
    .collectionGroup('guests')
    .where('verifyToken', '==', token)
    .limit(1)
    .get()
  if (snap.empty) return null
  return snap.docs[0]
}

async function expireIfPastDeadline(guestDoc: GuestDoc, data: FirebaseFirestore.DocumentData) {
  const apptDoc = await adminDb
    .collection('appointments')
    .doc(data.appointmentId)
    .get()

  if (!apptDoc.exists) {
    return { expired: false as const, apptDoc: null, slotDatetime: null, deadline: null }
  }

  const appt = apptDoc.data()!
  const slotDatetime = (appt.slotDatetime as Timestamp).toDate()
  const deadline     = new Date(slotDatetime.getTime() - 24 * 60 * 60 * 1000)

  if (data.status === 'pending' && Date.now() >= deadline.getTime()) {
    await guestDoc.ref.update({
      status:      'expired',
      expiredAt:   FieldValue.serverTimestamp(),
      verifyToken: FieldValue.delete(),
    })
    await recomputeGuestsAllVerified(data.appointmentId)
    return { expired: true as const, apptDoc, slotDatetime, deadline }
  }

  return { expired: false as const, apptDoc, slotDatetime, deadline }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const guestDoc = await findGuest(token)
  if (!guestDoc) {
    return NextResponse.json({ error: 'Link inválido o expirado' }, { status: 404 })
  }

  const data = guestDoc.data()
  if (data.status === 'expired') {
    return NextResponse.json({ error: 'El plazo de verificación ha vencido', reason: 'expired' }, { status: 410 })
  }
  if (data.status === 'excluded') {
    return NextResponse.json({ error: 'Esta invitación ya no está activa', reason: 'excluded' }, { status: 403 })
  }

  const deadlineState = await expireIfPastDeadline(guestDoc, data)

  if (!deadlineState.apptDoc?.exists) {
    return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
  }
  if (deadlineState.expired) {
    return NextResponse.json({ error: 'El plazo de verificación ha vencido', reason: 'expired' }, { status: 410 })
  }

  const appt = deadlineState.apptDoc.data()!
  const { slotDatetime, deadline } = deadlineState
  if (!slotDatetime || !deadline) {
    return NextResponse.json({ error: 'Cita inválida' }, { status: 500 })
  }

  return NextResponse.json({
    guest: {
      name:              data.name,
      status:            data.status,
      identificationUrl: data.identificationUrl ?? null,
    },
    appointment: {
      dateStr:      formatDate(slotDatetime),
      timeStr:      formatTime(slotDatetime),
      deadlineStr:  `${formatDate(deadline)} a las ${formatTime(deadline)}`,
      hostName:     appt.name,
    },
  })
}

// POST accepts multipart/form-data with a field "idFile"
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const guestDoc = await findGuest(token)
  if (!guestDoc) {
    return NextResponse.json({ error: 'Link inválido o expirado' }, { status: 404 })
  }

  const data = guestDoc.data()

  if (data.status === 'verified') {
    return NextResponse.json({ ok: true, alreadyVerified: true })
  }
  if (data.status === 'expired' || data.status === 'excluded') {
    return NextResponse.json({ error: 'Este link ya no está activo' }, { status: 410 })
  }

  const deadlineState = await expireIfPastDeadline(guestDoc, data)
  if (!deadlineState.apptDoc?.exists) {
    return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
  }
  if (deadlineState.expired) {
    return NextResponse.json({ error: 'El plazo de verificación ha vencido', reason: 'expired' }, { status: 410 })
  }

  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 415 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Formulario inválido' }, { status: 400 })
  }
  const idFile   = formData.get('idFile') as File | null

  if (!idFile || idFile.size === 0) {
    return NextResponse.json({ error: 'Identificación requerida' }, { status: 422 })
  }
  if (idFile.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'El archivo no puede superar 5 MB' }, { status: 422 })
  }
  if (!ALLOWED_MIME.includes(idFile.type)) {
    return NextResponse.json({ error: 'Formato no permitido. Usa JPG, PNG, WebP o PDF.' }, { status: 422 })
  }

  const extByMime: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf',
  }
  const fileExt        = extByMime[idFile.type] ?? 'bin'
  const storageKey     = `identifications/guest_${guestDoc.id}_${randomUUID()}.${fileExt}`
  const fileBuffer     = Buffer.from(await idFile.arrayBuffer())
  const fileRef        = adminStorage.bucket().file(storageKey)
  await fileRef.save(fileBuffer, {
    contentType: idFile.type,
    resumable:   false,
  })

  try {
    await guestDoc.ref.update({
      status:            'verified',
      identificationUrl: storageKey,
      verifiedAt:        FieldValue.serverTimestamp(),
      verifyToken:       FieldValue.delete(),
    })
  } catch (err) {
    await fileRef.delete().catch(deleteErr => {
      console.error('Failed to cleanup guest ID after verify error:', deleteErr)
    })
    throw err
  }

  await recomputeGuestsAllVerified(data.appointmentId)

  return NextResponse.json({ ok: true })
}
