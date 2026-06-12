import { NextResponse, type NextRequest } from 'next/server'

// Mirrors src/lib/admin-session.ts (signSession/getSession). Reimplemented
// here with Web Crypto because middleware runs on the edge runtime, where
// node:crypto is unavailable. Keep TTL and token format in sync.
const SESSION_TTL_MS = 4 * 60 * 60 * 1000

async function verifySessionEdge(token: string): Promise<boolean> {
  const secret = process.env.SESSION_SECRET
  if (!secret) return false

  const parts = token.split('.')
  if (parts.length !== 2) return false
  const [payload, signature] = parts

  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(payload)))
  const expected = Array.from(mac, b => b.toString(16).padStart(2, '0')).join('')

  if (signature.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= signature.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  if (diff !== 0) return false

  try {
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
      uid?: string; email?: string; issuedAt?: number
    }
    if (!json?.uid || !json.email || !Number.isFinite(json.issuedAt)) return false
    if (Date.now() - (json.issuedAt as number) > SESSION_TTL_MS) return false
    return true
  } catch {
    return false
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Protect all /admin routes except /admin/login
  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    const session = request.cookies.get('__session')?.value
    if (!session || !(await verifySessionEdge(session))) {
      const loginUrl = new URL('/admin/login', request.url)
      loginUrl.searchParams.set('from', pathname)
      const response = NextResponse.redirect(loginUrl)
      if (session) response.cookies.delete('__session')
      return response
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}
