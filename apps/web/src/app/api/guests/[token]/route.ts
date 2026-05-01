import { NextResponse } from 'next/server'
import { adminDb, adminStorage } from '@/lib/firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { formatDate, formatTime } from '@/lib/utils'
import { recomputeGuestsAllVerified } from '@/lib/guests'
import { randomUUID } from 'node:crypto'

export const dynamic = 'force-dynamic'

const MAX_FILE_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME   = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

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
    return NextResponse.json({ error: 'El plazo de verificación ha vencido' }, { status: 410 })
  }
  if (data.status === 'excluded') {
    return NextResponse.json({ error: 'Este link ya no está activo' }, { status: 410 })
  }

  const apptDoc = await adminDb
    .collection('appointments')
    .doc(data.appointmentId)
    .get()

  if (!apptDoc.exists) {
    return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
  }

  const appt = apptDoc.data()!
  const slotDatetime = (appt.slotDatetime as Timestamp).toDate()
  const deadline     = new Date(slotDatetime.getTime() - 24 * 60 * 60 * 1000)

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

  const formData = await request.formData()
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

  const fileExt        = idFile.name.split('.').pop() ?? 'jpg'
  const storageKey     = `identifications/guest_${guestDoc.id}_${randomUUID()}.${fileExt}`
  const fileBuffer     = Buffer.from(await idFile.arrayBuffer())
  await adminStorage.bucket().file(storageKey).save(fileBuffer, {
    contentType: idFile.type,
    resumable:   false,
  })

  await guestDoc.ref.update({
    status:            'verified',
    identificationUrl: storageKey,
    verifiedAt:        FieldValue.serverTimestamp(),
    verifyToken:       '',
  })

  await recomputeGuestsAllVerified(data.appointmentId)

  return NextResponse.json({ ok: true })
}
