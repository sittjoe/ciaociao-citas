import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { adminLoginSchema } from '@/lib/schemas'
import { signSession, SESSION_TTL_SECONDS } from '@/lib/admin-session'

export const dynamic = 'force-dynamic'

const MAX_ATTEMPTS = 5
const LOCKOUT_MS   = 15 * 60 * 1000

const attempts = new Map<string, { count: number; firstAt: number }>()

function getIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
}

export async function POST(request: Request) {
  try {
    const body   = await request.json()
    const parsed = adminLoginSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
    }

    const { password } = parsed.data
    const ip  = getIp(request)
    const now = Date.now()

    const rec = attempts.get(ip)
    if (rec) {
      const windowEnd = rec.firstAt + LOCKOUT_MS
      if (rec.count >= MAX_ATTEMPTS && now < windowEnd) {
        const minutesLeft = Math.ceil((windowEnd - now) / 60000)
        return NextResponse.json(
          { error: `Demasiados intentos. Espera ${minutesLeft} minuto(s).` },
          { status: 429 }
        )
      }
      if (now >= windowEnd) attempts.delete(ip)
    }

    const hash = process.env.ADMIN_PASSWORD_HASH?.trim()
    if (!hash) {
      console.error('ADMIN_PASSWORD_HASH env var not set')
      return NextResponse.json({ error: 'Error de configuración del servidor' }, { status: 500 })
    }

    const valid = await bcrypt.compare(password, hash)
    if (!valid) {
      const cur = attempts.get(ip)
      if (!cur || now >= cur.firstAt + LOCKOUT_MS) {
        attempts.set(ip, { count: 1, firstAt: now })
      } else {
        attempts.set(ip, { count: cur.count + 1, firstAt: cur.firstAt })
      }
      return NextResponse.json({ error: 'Contraseña incorrecta' }, { status: 401 })
    }

    attempts.delete(ip)

    const token    = signSession()
    const response = NextResponse.json({ ok: true })
    response.cookies.set('__session', token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   SESSION_TTL_SECONDS,
      path:     '/',
    })

    return response
  } catch (err) {
    console.error('POST /api/admin/login', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
