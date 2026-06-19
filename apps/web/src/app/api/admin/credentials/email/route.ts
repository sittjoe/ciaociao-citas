import { NextResponse } from 'next/server'
import { z } from 'zod'
import { adminAuth, adminDb } from '@/lib/firebase-admin'
import { requireAdminSession, verifyAdminPassword } from '@/lib/admin-auth'
import { checkPublicRateLimit, requestIp } from '@/lib/public-rate-limit'

export const dynamic = 'force-dynamic'

const schema = z.object({
  currentPassword: z.string().min(1, 'Contraseña actual requerida').max(128),
  email: z.string().email('Email inválido').max(200),
})

export async function POST(request: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (await checkPublicRateLimit({ key: `cred:email:${session.uid}`, windowMs: 60 * 60 * 1000, max: 5 })) {
    return NextResponse.json({ error: 'Demasiados intentos. Intenta más tarde.' }, { status: 429 })
  }

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' }, { status: 422 })
  }

  // Changing the email immediately can lock out the real owner via password
  // reset; require the current password to confirm it's really them.
  const ok = await verifyAdminPassword(session.email, parsed.data.currentPassword)
  if (!ok) {
    return NextResponse.json({ error: 'La contraseña actual no es correcta' }, { status: 403 })
  }

  const newEmail = parsed.data.email.trim().toLowerCase()

  try {
    await adminAuth.updateUser(session.uid, { email: newEmail })
    await adminDb.collection('admins').doc(session.uid).set(
      { email: newEmail, updatedAt: new Date() },
      { merge: true }
    )
    await adminDb.collection('auditLog').add({
      action: 'admin_email_changed',
      uid: session.uid,
      actorEmail: session.email,
      newEmail,
      ip: requestIp(request),
      ts: new Date(),
    }).catch(() => {})

    // Session embeds the old email — it must be cleared so isAdminUser() doesn't reject future requests
    const response = NextResponse.json({ ok: true })
    response.cookies.set('__session', '', { maxAge: 0, path: '/' })
    return response
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    if (message.includes('auth/email-already-exists')) {
      return NextResponse.json({ error: 'Ese email ya está en uso' }, { status: 409 })
    }
    console.error('POST /api/admin/credentials/email', err)
    return NextResponse.json({ error: 'No se pudo actualizar el email' }, { status: 500 })
  }
}
