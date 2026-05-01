import { randomBytes } from 'node:crypto'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from './firebase-admin'
import type { Guest, GuestStatus } from '@/types'

export type GuestInputData = { name: string; email: string }

export async function createGuestsForAppointment(
  appointmentId: string,
  guests: GuestInputData[],
): Promise<Guest[]> {
  const batch = adminDb.batch()
  const created: Guest[] = []

  for (const g of guests) {
    const ref = adminDb
      .collection('appointments')
      .doc(appointmentId)
      .collection('guests')
      .doc()

    const verifyToken = randomBytes(32).toString('hex')

    const guestData = {
      appointmentId,
      name: g.name.trim(),
      email: g.email.toLowerCase().trim(),
      status: 'pending' as GuestStatus,
      verifyToken,
      identificationUrl: null,
      invitedAt: FieldValue.serverTimestamp(),
      verifiedAt: null,
      expiredAt: null,
      excludedAt: null,
      excludedBy: null,
      reminder48Sent: false,
      reminder24Sent: false,
    }

    batch.set(ref, guestData)

    created.push({
      id: ref.id,
      appointmentId,
      name: guestData.name,
      email: guestData.email,
      status: 'pending',
      verifyToken,
      identificationUrl: null,
      invitedAt: new Date(),
      verifiedAt: null,
      expiredAt: null,
      excludedAt: null,
      excludedBy: null,
      reminder48Sent: false,
      reminder24Sent: false,
    })
  }

  await batch.commit()
  return created
}

export async function recomputeGuestsAllVerified(appointmentId: string): Promise<void> {
  const snap = await adminDb
    .collection('appointments')
    .doc(appointmentId)
    .collection('guests')
    .get()

  const active = snap.docs.filter(d => d.data().status !== 'excluded')
  const allVerified = active.length === 0 || active.every(d => d.data().status === 'verified')

  await adminDb.collection('appointments').doc(appointmentId).update({
    guestsAllVerified: allVerified,
    updatedAt: FieldValue.serverTimestamp(),
  })
}

export async function expirePendingGuests(beforeDate: Date): Promise<number> {
  const apptSnap = await adminDb
    .collection('appointments')
    .where('status', '==', 'accepted')
    .where('slotDatetime', '<=', Timestamp.fromDate(beforeDate))
    .get()

  let expired = 0

  for (const apptDoc of apptSnap.docs) {
    const guestsSnap = await apptDoc.ref
      .collection('guests')
      .where('status', '==', 'pending')
      .get()

    if (guestsSnap.empty) continue

    const batch = adminDb.batch()
    for (const g of guestsSnap.docs) {
      batch.update(g.ref, {
        status: 'expired',
        expiredAt: FieldValue.serverTimestamp(),
      })
      expired++
    }
    await batch.commit()
    await recomputeGuestsAllVerified(apptDoc.id)
  }

  return expired
}

export function mapGuest(id: string, data: FirebaseFirestore.DocumentData): Guest {
  return {
    id,
    appointmentId: data.appointmentId,
    name: data.name,
    email: data.email,
    status: data.status,
    verifyToken: data.verifyToken,
    identificationUrl: data.identificationUrl ?? null,
    invitedAt: (data.invitedAt as Timestamp)?.toDate() ?? new Date(),
    verifiedAt: data.verifiedAt ? (data.verifiedAt as Timestamp).toDate() : null,
    expiredAt: data.expiredAt ? (data.expiredAt as Timestamp).toDate() : null,
    excludedAt: data.excludedAt ? (data.excludedAt as Timestamp).toDate() : null,
    excludedBy: data.excludedBy ?? null,
    reminder48Sent: data.reminder48Sent ?? false,
    reminder24Sent: data.reminder24Sent ?? false,
  }
}
