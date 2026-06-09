import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase-admin'
import { waitlistSchema } from '@/lib/schemas'
import { sanitize } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const parsed = waitlistSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 422 })
    }

    const data = parsed.data
    await adminDb.collection('availabilityWaitlist').add({
      name:        sanitize(data.name),
      email:       data.email.toLowerCase().trim(),
      phone:       data.phone.trim(),
      productType: sanitize(data.productType ?? ''),
      budgetRange: sanitize(data.budgetRange ?? ''),
      message:     sanitize(data.message ?? ''),
      status:      'new',
      source:      'no_slots',
      createdAt:   FieldValue.serverTimestamp(),
      updatedAt:   FieldValue.serverTimestamp(),
    })

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err) {
    console.error('POST /api/waitlist', err)
    return NextResponse.json({ error: 'Error al guardar tus datos' }, { status: 500 })
  }
}
