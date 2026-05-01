import { NextResponse } from 'next/server'
import { z } from 'zod'
import { adminAuth } from '@/lib/firebase-admin'
import { requireAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const schema = z.object({
  password: z.string().min(8, 'Mínimo 8 caracteres').max(128),
})

export async function POST(request: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Contraseña inválida' }, { status: 422 })
  }

  try {
    await adminAuth.updateUser(session.uid, { password: parsed.data.password })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('POST /api/admin/credentials/password', err)
    return NextResponse.json({ error: 'No se pudo actualizar la contraseña' }, { status: 500 })
  }
}
