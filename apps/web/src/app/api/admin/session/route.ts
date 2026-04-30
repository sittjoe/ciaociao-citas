import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set('__session', '', {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   0,
    path:     '/',
  })
  return response
}
