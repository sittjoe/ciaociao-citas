import { describe, expect, it, vi } from 'vitest'
import { getConfiguredAdminEmails, isEmailConfigured } from './email'

describe('email configuration', () => {
  it('merges admin recipients from env without duplicates', () => {
    vi.stubEnv('ADMIN_EMAIL', 'info@ciaociao.mx')
    vi.stubEnv('ADMIN_BOOTSTRAP_EMAILS', 'info@ciaociao.mx, ventas@ciaociao.mx , Admin@CiaoCiao.mx')

    expect(getConfiguredAdminEmails()).toEqual([
      'info@ciaociao.mx',
      'ventas@ciaociao.mx',
      'admin@ciaociao.mx',
    ])
  })

  it('does not require Resend at import time', () => {
    vi.stubEnv('RESEND_API_KEY', '')

    expect(isEmailConfigured()).toBe(false)
  })
})
