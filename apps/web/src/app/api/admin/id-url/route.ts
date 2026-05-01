import { NextResponse } from 'next/server'
import { adminStorage } from '@/lib/firebase-admin'
import { requireAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const path = searchParams.get('path')
  if (!path) {
    return NextResponse.json({ error: 'path requerido' }, { status: 400 })
  }

  // Only allow paths within the identifications/ prefix to prevent path traversal
  if (!path.startsWith('identifications/')) {
    return NextResponse.json({ error: 'Ruta no permitida' }, { status: 403 })
  }

  try {
    const [url] = await adminStorage.bucket().file(path).getSignedUrl({
      action: 'read',
      expires: Date.now() + 5 * 60 * 1000, // 5 min
    })
    return NextResponse.redirect(url)
  } catch {
    return NextResponse.json({ error: 'No se pudo generar el link' }, { status: 500 })
  }
}
