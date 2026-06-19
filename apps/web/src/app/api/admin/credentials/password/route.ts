import { NextResponse } from 'next/server'
import { z } from 'zod'
import { adminAuth, adminDb } from '@/lib/firebase-admin'
import { requireAdminSession, verifyAdminPassword } from '@/lib/admin-auth'
import { checkPublicRateLimit, requestIp } from '@/lib/public-rate-limit'

export const dynamic = 'force-dynamic'

const schema = z.object({
  currentPassword: z.string().min(1, 'Contraseña actual requerida').max(128),
  password: z.string().min(8, 'Mínimo 8 caracteres').max(128),
})

export async function POST(request: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Throttle credential changes per admin, even with a valid session
  if (await checkPublicRateLimit({ key: `cred:pwd:${session.uid}`, windowMs: 60 * 60 * 1000, max: 5 })) {
    return NextResponse.json({ error: 'Demasiados intentos. Intenta más tarde.' }, { status: 429 })
  }

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' }, { status: 422 })
  }

  // Require the current password so a hijacked open session can't change it
  const ok = await verifyAdminPassword(session.email, parsed.data.currentPassword)
  if (!ok) {
    return NextResponse.json({ error: 'La contraseña actual no es correcta' }, { status: 403 })
  }

  try {
    await adminAuth.updateUser(session.uid, { password: parsed.data.password })
    await adminDb.collection('auditLog').add({
      action: 'admin_password_changed',
      uid: session.uid,
      actorEmail: session.email,
      ip: requestIp(request),
      ts: new Date(),
    }).catch(() => {})
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('POST /api/admin/credentials/password', err)
    return NextResponse.json({ error: 'No se pudo actualizar la contraseña' }, { status: 500 })
  }
}
