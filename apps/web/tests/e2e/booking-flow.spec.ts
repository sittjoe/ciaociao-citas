import { expect, test } from '@playwright/test'

// Smoke test for the public booking flow.
//
// Skipped by default: it requires either (a) a live Firebase emulator with
// seed data, or (b) MSW-style server-action mocks. Wire one of those up and
// flip `test` back on. We keep the spec checked in so the shape of the test
// is reviewed alongside the feature, not invented at incident time.
test.describe('public booking flow', () => {
  test.skip(
    true,
    'Requires Firebase emulator with seeded slots OR mocked server actions. ' +
      'Run: pnpm exec firebase emulators:start --only firestore,auth,storage ' +
      'then unskip and set PLAYWRIGHT_BASE_URL.',
  )

  test('a client can pick a slot, complete the wizard and see a confirmation code', async ({ page }) => {
    await page.goto('/')

    // Step 1 — choose a date/slot. The test seed must publish at least one
    // future slot. Selector mirrors the booking wizard markup.
    await expect(page.getByRole('heading', { name: /reservar/i })).toBeVisible()
    await page.getByRole('button', { name: /próximo|siguiente/i }).first().click()

    // Step 2 — fill the contact form.
    await page.getByLabel(/nombre/i).fill('Test User')
    await page.getByLabel(/email/i).fill('test@example.com')
    await page.getByLabel(/teléfono|telefono/i).fill('5512345678')

    // Step 3 — upload identification (PNG header + minimal pixels).
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde,
    ])
    await page.getByLabel(/identificación|identificacion/i).setInputFiles({
      name: 'id.png',
      mimeType: 'image/png',
      buffer: png,
    })

    // Step 4 — submit.
    await page.getByRole('button', { name: /confirmar|reservar/i }).click()

    // Confirmation screen.
    await expect(page.getByText(/código de confirmación|confirmation code/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('confirmation-code')).toHaveText(/^[A-Z0-9]{8}$/)
  })
})
