import { NextResponse } from 'next/server'
import { adminStorage, adminDb } from '@/lib/firebase-admin'
import { requireAdminSession } from '@/lib/admin-auth'
import { normalizeIdentificationPath } from '@/lib/identifications'
import { requestIp } from '@/lib/public-rate-limit'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const admin = await requireAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const path = searchParams.get('path')
  if (!path) {
    return NextResponse.json({ error: 'path requerido' }, { status: 400 })
  }

  const storagePath = normalizeIdentificationPath(path)
  if (!storagePath) {
    return NextResponse.json({ error: 'Ruta no permitida' }, { status: 403 })
  }

  try {
    const [url] = await adminStorage.bucket().file(storagePath).getSignedUrl({
      action: 'read',
      expires: Date.now() + 2 * 60 * 1000, // 2 min — short-lived access to PII
    })
    // Every access to an official ID document (sensitive PII) is logged:
    // who, what, when, from where. Needed for privacy traceability.
    await adminDb.collection('auditLog').add({
      action: 'id_document_accessed',
      storagePath,
      actorEmail: admin.email,
      uid: admin.uid,
      ip: requestIp(request),
      ts: new Date(),
    }).catch(() => {})
    return NextResponse.redirect(url)
  } catch {
    return NextResponse.json({ error: 'No se pudo generar el link' }, { status: 500 })
  }
}
