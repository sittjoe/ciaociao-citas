import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { cdmxHour, cdmxIsoWeekKey, inBusinessSendHours } from '@/lib/reminder-windows'
import { isEmailConfigured, sendSlotsReminderEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

/**
 * Recordatorio semanal de publicar horarios. Llamado por Vercel cron cada
 * lunes 9:00 CDMX (vercel.json: "0 15 * * 1" — cron corre en UTC; CDMX es
 * UTC-6 fijo desde que México eliminó el horario de verano).
 *
 * Sustituye al antiguo cron generate-slots: los horarios se publican A MANO
 * cada semana por decisión del negocio, y este correo evita que se olvide.
 *
 * Robusto a cualquier frecuencia (hay un llamador externo que pega a los crons
 * cada ~30 min): solo sale de 08:00 a 22:00 CDMX y UNA vez por semana ISO
 * (documento de control `slotsReminderRuns/{2026-W41}` creado con create()).
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

  const now = new Date()
  if (cdmxHour(now) < 8 || !inBusinessSendHours(now)) {
    return NextResponse.json({ ok: true, skipped: 'fuera_de_horario' })
  }
  const weekKey = cdmxIsoWeekKey(now)
  const controlRef = adminDb.collection('slotsReminderRuns').doc(weekKey)

  try {
    try {
      await controlRef.create({ status: 'sending', createdAt: FieldValue.serverTimestamp() })
    } catch (err) {
      if ((err as { code?: number }).code === 6) { // ALREADY_EXISTS: ya salió esta semana
        return NextResponse.json({ ok: true, skipped: 'ya_enviado', week: weekKey })
      }
      throw err
    }

    // Inventario actual para que el correo sea accionable: cuántos slots hay
    // publicados y cuántos siguen libres en las próximas dos semanas.
    const horizonDays = 14
    const until = new Date(now.getTime() + horizonDays * 86_400_000)

    const snap = await adminDb
      .collection('slots')
      .where('datetime', '>=', Timestamp.fromDate(now))
      .where('datetime', '<=', Timestamp.fromDate(until))
      .get()

    const published = snap.size
    const available = snap.docs.filter(doc => doc.data().available === true).length

    let result: Awaited<ReturnType<typeof sendSlotsReminderEmail>>
    try {
      result = await sendSlotsReminderEmail({ published, available, horizonDays })
    } catch (err) {
      // No se borra la marca: el correo quedó en emailOutbox como 'failed' y
      // retryEmailOutbox() lo reintenta; borrarla lo mandaría dos veces.
      await controlRef.update({ status: 'failed', updatedAt: FieldValue.serverTimestamp() }).catch(() => {})
      throw err
    }
    await controlRef.update({ status: result.sent ? 'sent' : 'no_recipients', sentAt: FieldValue.serverTimestamp() }).catch(() => {})

    return NextResponse.json({ ok: true, published, available, ...result })
  } catch (err) {
    console.error('GET /api/cron/slots-reminder', err)
    return NextResponse.json({ error: 'Error al enviar recordatorio' }, { status: 500 })
  }
}
