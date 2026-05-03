import { NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase-admin'
import { signSession, SESSION_TTL_SECONDS } from '@/lib/admin-session'
import { isAdminUser } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

async function checkRateLimit(ip: string): Promise<boolean> {
  const key        = ip.replace(/[^\w.-]/g, '_').slice(0, 128)
  const ref        = adminDb.collection('loginAttempts').doc(key)
  const WINDOW_MS  = 15 * 60 * 1000
  const MAX        = 5
  const now        = Date.now()

  return adminDb.runTransaction(async tx => {
    const snap = await tx.get(ref)
    if (!snap.exists) {
      tx.set(ref, { count: 1, windowStart: now })
      return false
    }
    const { count, windowStart } = snap.data() as { count: number; windowStart: number }
    if (now - windowStart > WINDOW_MS) {
      tx.update(ref, { count: 1, windowStart: now })
      return false
    }
    if (count >= MAX) return true
    tx.update(ref, { count: count + 1 })
    return false
  })
}

export async function POST(request: Request) {
  try {
    const ip = (request.headers.get('x-forwarded-for') ?? '127.0.0.1').split(',')[0].trim()
    if (await checkRateLimit(ip)) {
      return NextResponse.json({ error: 'Demasiados intentos. Intenta de nuevo en 15 minutos.' }, { status: 429 })
    }

    const body = await request.json() as { idToken?: string }
    if (!body.idToken || typeof body.idToken !== 'string') {
      return NextResponse.json({ error: 'Token requerido' }, { status: 400 })
    }

    const decoded = await adminAuth.verifyIdToken(body.idToken)
    const email = decoded.email?.toLowerCase().trim()
    if (!email || !(await isAdminUser(decoded.uid, email))) {
      return NextResponse.json({ error: 'Usuario sin permisos de administrador' }, { status: 403 })
    }

    const token = signSession({ uid: decoded.uid, email })
    const response = NextResponse.json({ ok: true })
    response.cookies.set('__session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: SESSION_TTL_SECONDS,
      path: '/',
    })

    return response
  } catch (err) {
    console.error('POST /api/admin/login', err)
    return NextResponse.json({ error: 'No se pudo iniciar sesión' }, { status: 401 })
  }
}
