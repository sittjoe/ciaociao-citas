import { createHmac, timingSafeEqual } from 'crypto'

const SESSION_TTL_MS = 4 * 60 * 60 * 1000 // 4 hours

function getSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET env var not set')
  return secret
}

export function signSession(): string {
  const ts  = Date.now().toString()
  const sig = createHmac('sha256', getSecret()).update(`admin.${ts}`).digest('hex')
  return `admin.${ts}.${sig}`
}

export function verifySession(token: string | undefined): boolean {
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [user, ts, sig] = parts
  if (user !== 'admin') return false

  const issuedAt = parseInt(ts, 10)
  if (!Number.isFinite(issuedAt)) return false
  if (Date.now() - issuedAt > SESSION_TTL_MS) return false

  const expected = createHmac('sha256', getSecret()).update(`admin.${ts}`).digest('hex')
  const a = Buffer.from(sig, 'hex')
  const b = Buffer.from(expected, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000
