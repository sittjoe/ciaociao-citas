import { test } from '@playwright/test'

// Conceptual spec: race two parallel bookings against a single slot and
// assert exactly one succeeds. We keep this skipped because Playwright alone
// cannot deterministically reproduce the race without the Firestore emulator:
// real Firestore rate-limits writes from the same process and the in-memory
// emulator is the only place where two contexts race through the same
// transaction without external retries muddying the signal.
//
// How to run locally once we add the emulator harness:
//
//   1. terminal A: pnpm exec firebase emulators:start --only firestore,auth
//   2. terminal B: FIRESTORE_EMULATOR_HOST=localhost:8080 \
//                  PLAYWRIGHT_BASE_URL=http://localhost:3000 \
//                  pnpm test:e2e double-booking-prevention
//   3. Test seeds one slot, fires two POSTs to /api/booking concurrently,
//      and expects: one 200 (confirmationCode returned) and one 409 (slot
//      taken). Then asserts the appointments collection has exactly one
//      doc for that slotId.
//
// The transaction logic already lives in apps/web/src/lib/appointments.ts
// and is covered by unit tests in appointments.test.ts — this spec is the
// system-level proof.
test.describe('slot double-booking prevention', () => {
  test.skip(
    true,
    'Requires Firestore emulator. See header comment for runbook.',
  )

  test('two concurrent bookings for the same slot: exactly one succeeds', async () => {
    // Intentionally empty: see skip reason and runbook above.
  })
})
