import { NextResponse } from 'next/server'
import { z } from 'zod'
import { deactivateAdmin, listAdmins, requireAdminSession, upsertAdminByEmail } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const createAdminSchema = z.object({
  email: z.string().email().max(200),
})

export async function GET() {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  return NextResponse.json({ admins: await listAdmins() })
}

export async function POST(request: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const parsed = createAdminSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Email inválido' }, { status: 422 })
  }

  try {
    const admin = await upsertAdminByEmail(parsed.data.email, session)
    return NextResponse.json({ admin }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    if (message.includes('auth/user-not-found')) {
      return NextResponse.json({ error: 'Ese email no existe en Firebase Auth. Crea primero el usuario con contraseña.' }, { status: 404 })
    }
    console.error('POST /api/admin/users', err)
    return NextResponse.json({ error: 'No se pudo crear el admin' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const uid = searchParams.get('uid')
  if (!uid) return NextResponse.json({ error: 'UID requerido' }, { status: 400 })
  if (uid === session.uid) return NextResponse.json({ error: 'No puedes desactivarte a ti mismo' }, { status: 409 })

  await deactivateAdmin(uid, session)
  return NextResponse.json({ ok: true })
}
