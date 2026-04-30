import { NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebase-admin'
import { adminLoginSchema } from '@/lib/schemas'

export const dynamic = 'force-dynamic'

// Calls the adminLogin Cloud Function and exchanges the custom token
// for an ID token that we store as an httpOnly session cookie.
export async function POST(request: Request) {
  try {
    const body   = await request.json()
    const parsed = adminLoginSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
    }

    const { password } = parsed.data

    // Call the adminLogin Cloud Function REST endpoint
    const projectId = process.env.FIREBASE_PROJECT_ID!
    const region    = 'us-central1'
    const fnUrl     = `https://${region}-${projectId}.cloudfunctions.net/adminLogin`

    const cfRes = await fetch(fnUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { password } }),
    })

    if (!cfRes.ok) {
      const errBody = await cfRes.json().catch(() => ({}))
      const status  = cfRes.status === 429 ? 429 : 401
      const message = (errBody as { error?: { message?: string } })?.error?.message ?? 'Credenciales inválidas'
      return NextResponse.json({ error: message }, { status })
    }

    const cfData = await cfRes.json() as { result: { token: string } }
    const customToken = cfData.result.token

    // Exchange custom token → ID token via Firebase REST API
    const apiKey   = process.env.NEXT_PUBLIC_FIREBASE_API_KEY!
    const exchRes  = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: customToken, returnSecureToken: true }),
      }
    )

    if (!exchRes.ok) {
      return NextResponse.json({ error: 'Error al crear sesión' }, { status: 500 })
    }

    const exchData = await exchRes.json() as { idToken: string; expiresIn: string }
    const idToken  = exchData.idToken

    // Verify the ID token and create a session cookie (4h TTL)
    const expiresIn = 4 * 60 * 60 * 1000
    const cookie    = await adminAuth.createSessionCookie(idToken, { expiresIn })

    const response = NextResponse.json({ ok: true })
    response.cookies.set('__session', cookie, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   expiresIn / 1000,
      path:     '/',
    })

    return response
  } catch (err) {
    console.error('POST /api/admin/login', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
