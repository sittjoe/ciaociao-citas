import { describe, expect, it, vi } from 'vitest'
import { signSession, getSession, verifySession } from './admin-session'

describe('admin session', () => {
  it('round-trips an admin identity in the signed session cookie', () => {
    vi.stubEnv('SESSION_SECRET', 'test-secret')

    const token = signSession({ uid: 'uid-123', email: 'admin@ciaociao.mx' })
    const session = getSession(token)

    expect(verifySession(token)).toBe(true)
    expect(session).toMatchObject({ uid: 'uid-123', email: 'admin@ciaociao.mx' })
  })

  it('rejects tampered tokens', () => {
    vi.stubEnv('SESSION_SECRET', 'test-secret')

    const token = signSession({ uid: 'uid-123', email: 'admin@ciaociao.mx' })
    const [payload, signature] = token.split('.')
    const replacement = payload[0] === 'a' ? 'b' : 'a'
    const tampered = `${replacement}${payload.slice(1)}.${signature}`

    expect(getSession(tampered)).toBeNull()
    expect(verifySession(tampered)).toBe(false)
  })
})
