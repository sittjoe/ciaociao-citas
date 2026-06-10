import { adminDb } from './firebase-admin'

export function requestIp(request: Request): string {
  return (request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for') ?? '127.0.0.1')
    .split(',')[0]
    .trim()
}

export async function checkPublicRateLimit(params: {
  key: string
  windowMs: number
  max: number
}): Promise<boolean> {
  const safeKey = params.key.replace(/[^\w.:@-]/g, '_').slice(0, 180)
  const ref = adminDb.collection('publicRateLimits').doc(safeKey)
  const now = Date.now()

  return adminDb.runTransaction(async tx => {
    const snap = await tx.get(ref)
    if (!snap.exists) {
      tx.set(ref, { count: 1, windowStart: now, updatedAtMs: now })
      return false
    }
    const data = snap.data() as { count?: number; windowStart?: number }
    const count = Number(data.count ?? 0)
    const windowStart = Number(data.windowStart ?? 0)
    if (now - windowStart > params.windowMs) {
      tx.set(ref, { count: 1, windowStart: now, updatedAtMs: now }, { merge: true })
      return false
    }
    if (count >= params.max) return true
    tx.update(ref, { count: count + 1, updatedAtMs: now })
    return false
  })
}
