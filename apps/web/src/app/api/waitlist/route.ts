import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase-admin'
import { waitlistSchema } from '@/lib/schemas'
import { phoneDigits, sanitize } from '@/lib/utils'
import { checkPublicRateLimit, requestIp } from '@/lib/public-rate-limit'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const ip = requestIp(request)
    if (await checkPublicRateLimit({ key: `waitlist:ip:${ip}`, windowMs: 60 * 60 * 1000, max: 10 })) {
      return NextResponse.json({ error: 'Demasiados intentos. Intenta más tarde.' }, { status: 429 })
    }
    const parsed = waitlistSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 422 })
    }

    const data = parsed.data
    const email = data.email.toLowerCase().trim()
    const phone = data.phone.trim()
    const digits = phoneDigits(phone)
    const dedupeKey = `${email}_${digits}_${data.appointmentType}`.replace(/[^\w.@-]/g, '_').slice(0, 180)
    const ref = adminDb.collection('availabilityWaitlist').doc(dedupeKey)
    await adminDb.runTransaction(async tx => {
      const existing = await tx.get(ref)
      tx.set(ref, {
        appointmentType: data.appointmentType,
        name:        sanitize(data.name),
        email,
        phone,
        phoneDigits: digits,
        productType: sanitize(data.productType ?? ''),
        budgetRange: sanitize(data.budgetRange ?? ''),
        message:     sanitize(data.message ?? ''),
        status:      'new',
        source:      'no_slots',
        createdAt:   existing.exists ? existing.data()?.createdAt ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
        updatedAt:   FieldValue.serverTimestamp(),
      }, { merge: true })
    })

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err) {
    console.error('POST /api/waitlist', err)
    return NextResponse.json({ error: 'Error al guardar tus datos' }, { status: 500 })
  }
}
