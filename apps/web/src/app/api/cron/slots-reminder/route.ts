import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { isEmailConfigured, sendSlotsReminderEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

/**
 * Recordatorio semanal de publicar horarios. Llamado por Vercel cron cada
 * lunes 9:00 CDMX (vercel.json: "0 15 * * 1" — cron corre en UTC; CDMX es
 * UTC-6 fijo desde que México eliminó el horario de verano).
 *
 * Sustituye al antiguo cron generate-slots: los horarios se publican A MANO
 * cada semana por decisión del negocio, y este correo evita que se olvide.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) {
    return NextResponse.json({ error: 'Cron not configured' }, { status: 503 })
  }
  if (request.headers.get('Authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isEmailConfigured()) {
    return NextResponse.json({ error: 'RESEND_API_KEY no configurado' }, { status: 503 })
  }

  try {
    // Inventario actual para que el correo sea accionable: cuántos slots hay
    // publicados y cuántos siguen libres en las próximas dos semanas.
    const now = new Date()
    const horizonDays = 14
    const until = new Date(now.getTime() + horizonDays * 86_400_000)

    const snap = await adminDb
      .collection('slots')
      .where('datetime', '>=', Timestamp.fromDate(now))
      .where('datetime', '<=', Timestamp.fromDate(until))
      .get()

    const published = snap.size
    const available = snap.docs.filter(doc => doc.data().available === true).length

    const result = await sendSlotsReminderEmail({ published, available, horizonDays })

    return NextResponse.json({ ok: true, published, available, ...result })
  } catch (err) {
    console.error('GET /api/cron/slots-reminder', err)
    return NextResponse.json({ error: 'Error al enviar recordatorio' }, { status: 500 })
  }
}
