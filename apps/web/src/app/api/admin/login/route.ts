import { NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebase-admin'
import { signSession, SESSION_TTL_SECONDS } from '@/lib/admin-session'
import { isAdminUser } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
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
