import { NextResponse } from 'next/server'
import { z } from 'zod'
import { adminAuth, adminDb } from '@/lib/firebase-admin'
import { requireAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const schema = z.object({
  email: z.string().email('Email inválido').max(200),
})

export async function POST(request: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Email inválido' }, { status: 422 })
  }

  const newEmail = parsed.data.email.trim().toLowerCase()

  try {
    await adminAuth.updateUser(session.uid, { email: newEmail })
    await adminDb.collection('admins').doc(session.uid).set(
      { email: newEmail, updatedAt: new Date() },
      { merge: true }
    )

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
