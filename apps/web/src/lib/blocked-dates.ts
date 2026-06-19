import { adminDb } from './firebase-admin'
import { formatInTimeZone } from 'date-fns-tz'
import { BUSINESS_TZ } from './utils'

const COLLECTION = 'blockedDates'

export interface BlockedDate {
  date: string          // YYYY-MM-DD (CDMX calendar day) — also the doc id
  reason: string
  createdBy?: string
}

/** CDMX calendar-day key for an instant. */
export function businessDateKey(d: Date): string {
  return formatInTimeZone(d, BUSINESS_TZ, 'yyyy-MM-dd')
}

/**
 * Set of blocked CDMX dates. FAIL-OPEN by design: if this read fails it returns
 * an empty set so a bug in the blocked-dates feature can never take down the
 * public booking flow. The collection is tiny (vacation/closure days).
 */
export async function getBlockedDateSet(): Promise<Set<string>> {
  try {
    const snap = await adminDb.collection(COLLECTION).limit(500).get()
    return new Set(snap.docs.map(d => String(d.data().date ?? d.id)))
  } catch (err) {
    console.error('getBlockedDateSet failed (failing open):', err)
    return new Set()
  }
}

export async function listBlockedDates(): Promise<BlockedDate[]> {
  const snap = await adminDb.collection(COLLECTION).orderBy('date').limit(500).get()
  return snap.docs.map(d => {
    const data = d.data()
    return { date: String(data.date ?? d.id), reason: String(data.reason ?? ''), createdBy: data.createdBy }
  })
}
