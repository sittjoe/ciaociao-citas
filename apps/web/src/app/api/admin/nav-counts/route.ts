import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { requireAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

/**
 * Conteos para los badges del nav del panel:
 *  - pendientes: citas con status 'pending' (badge de «Citas»).
 *  - problemas:  versión barata de los conteos clave de /admin/problemas
 *    (emails fallidos, Calendar con error, video sin link, invitados
 *    expirados, asistencia sin registrar + no-shows de los últimos 14 días).
 *
 * Usa agregaciones count() donde se puede y select() en las queries que
 * necesitan filtro en memoria, para que el nav pueda refrescar seguido sin
 * costo real. Mismas formas de query (índices) que ya usa /admin/problemas.
 */
export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const now = new Date()
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

    const [pendingCount, failedEmailsCount, calendarFailedCount, expiredGuestsCount, videoSnap, pastAcceptedSnap] = await Promise.all([
      adminDb.collection('appointments').where('status', '==', 'pending').count().get(),
      adminDb.collection('emailOutbox').where('status', '==', 'failed').count().get(),
      adminDb.collection('appointments').where('calendarSyncFailed', '==', true).count().get(),
      adminDb.collectionGroup('guests').where('status', '==', 'expired').count().get(),
      // Video aceptadas próximas — el link faltante se detecta en memoria
      // (meetingUrl vacío no es consultable); select() abarata la lectura.
      adminDb.collection('appointments')
        .where('status', '==', 'accepted')
        .where('appointmentType', '==', 'video_engagement_rings')
        .where('slotDatetime', '>=', Timestamp.fromDate(now))
        .orderBy('slotDatetime')
        .limit(30)
        .select('meetingUrl')
        .get(),
      // Aceptadas pasadas (14 días): asistencia sin registrar o no-show se
      // separan en memoria — los docs viejos no tienen el campo `attended`.
      adminDb.collection('appointments')
        .where('status', '==', 'accepted')
        .where('slotDatetime', '>=', Timestamp.fromDate(twoWeeksAgo))
        .where('slotDatetime', '<', Timestamp.fromDate(now))
        .orderBy('slotDatetime')
        .limit(200)
        .select('attended')
        .get(),
    ])

    const videoMissingLink = videoSnap.docs
      .filter(doc => !String(doc.get('meetingUrl') ?? '').trim())
      .length

    // Sin registrar (null/undefined) y no-shows (false) cuentan como problema;
    // attended === true es una cita cerrada en orden.
    const attendanceIssues = pastAcceptedSnap.docs
      .filter(doc => doc.get('attended') !== true)
      .length

    const problemas =
      failedEmailsCount.data().count +
      calendarFailedCount.data().count +
      expiredGuestsCount.data().count +
      videoMissingLink +
      attendanceIssues

    return NextResponse.json({
      pendientes: pendingCount.data().count,
      problemas,
    })
  } catch (err) {
    console.error('GET /api/admin/nav-counts', err)
    return NextResponse.json({ error: 'Error al obtener conteos' }, { status: 500 })
  }
}
