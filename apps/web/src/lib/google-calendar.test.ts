import { afterEach, describe, expect, it, vi } from 'vitest'
import { getGoogleCalendarConfigStatus, isGoogleCalendarConfigured } from './google-calendar'

describe('google calendar configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('does not treat Firebase credentials as Calendar credentials', () => {
    vi.stubEnv('GOOGLE_CALENDAR_ID', 'calendar@example.com')
    vi.stubEnv('FIREBASE_CLIENT_EMAIL', 'firebase-adminsdk@example.iam.gserviceaccount.com')
    vi.stubEnv('FIREBASE_PRIVATE_KEY', '-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----')
    vi.stubEnv('GOOGLE_CLIENT_EMAIL', '')
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL', '')
    vi.stubEnv('GOOGLE_PRIVATE_KEY', '')
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY', '')

    expect(isGoogleCalendarConfigured()).toBe(false)
    expect(getGoogleCalendarConfigStatus()).toMatchObject({
      configured: false,
      calendarId: true,
      clientEmail: false,
      privateKey: false,
      usingDedicatedCredentials: false,
    })
  })

  it('requires dedicated calendar id, client email, and private key', () => {
    vi.stubEnv('GOOGLE_CALENDAR_ID', 'calendar@example.com')
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL', 'calendar-sa@example.iam.gserviceaccount.com')
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY', '-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----')

    expect(isGoogleCalendarConfigured()).toBe(true)
    expect(getGoogleCalendarConfigStatus()).toMatchObject({
      configured: true,
      calendarId: true,
      clientEmail: true,
      privateKey: true,
      usingDedicatedCredentials: true,
    })
  })
})
