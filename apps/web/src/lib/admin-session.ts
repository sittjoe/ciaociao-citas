import { createHmac, timingSafeEqual } from 'crypto'

const SESSION_TTL_MS = 4 * 60 * 60 * 1000 // 4 hours

export interface AdminSession {
  uid: string
  email: string
  issuedAt: number
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET env var not set')
  return secret
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function decode<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T
  } catch {
    return null
  }
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('hex')
}

export function signSession(identity: { uid: string; email: string }): string {
  const payload = encode({
    uid: identity.uid,
    email: identity.email.toLowerCase().trim(),
    issuedAt: Date.now(),
  })
  return `${payload}.${sign(payload)}`
}

export function getSession(token: string | undefined): AdminSession | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null

  const [payload, signature] = parts
  const expected = sign(payload)
  const a = Buffer.from(signature, 'hex')
  const b = Buffer.from(expected, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  const session = decode<AdminSession>(payload)
  if (!session?.uid || !session.email || !Number.isFinite(session.issuedAt)) return null
  if (Date.now() - session.issuedAt > SESSION_TTL_MS) return null

  return session
}

export function verifySession(token: string | undefined): boolean {
  return getSession(token) !== null
}

export const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000
