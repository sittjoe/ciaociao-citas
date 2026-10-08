import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { fromZonedTime } from 'date-fns-tz'
import { adminDb } from './firebase-admin'
import { sendReminder, sendReminder24Confirm } from './email'
import { mapAppointment } from './appointment-decision'
import { BUSINESS_TZ } from './utils'
import {
  cdmxDateKey,
  inReminder24Window,
  inReminder2Window,
  isQuietHours,
  QUIET_START_HOUR,
  reminder2Range,
  tomorrowRangeCdmx,
} from './reminder-windows'

/*
 * Respaldo del cron para los recordatorios a clientas («confirma tu cita de
 * mañana» y «tu cita es en 2 horas»). La vía principal son los correos
 * programados en Resend al aceptar la cita (lib/email.ts); esto cubre citas a
 * >30 días, aceptadas con <24 h y fallos de programación.
 *
 * Es correcto a CUALQUIER frecuencia de llamada (hoy: un llamador externo cada
 * ~30 min + el cron diario de vercel.json):
 *  - cada recordatorio solo sale si AHORA cae en su ventana (lib/reminder-windows);
 *  - la marca por cita+tipo (`reminder24Sent` / `reminder2Sent`) se toma en una
 *    transacción, así dos corridas simultáneas no mandan el mismo correo;
 *  - el envío lleva Idempotency-Key por cita+tipo+horario (segunda red).
 */

const MIN = 60 * 1000

type Flag = 'reminder24Sent' | 'reminder2Sent'

export interface ClientRemindersResult {
  sent24: number
  sent2: number
  /** Corrida en horario silencioso: el de «mañana» se pospone a las 08:00. */
  quiet: boolean
  errors: string[]
}

/**
 * Toma la marca idempotente de la cita en una transacción. Devuelve los datos
 * frescos (link de video vigente, etc.) o null si no corresponde enviar.
 */
async function claimReminder(
  ref: FirebaseFirestore.DocumentReference,
  flag: Flag,
  slotMs: number,
): Promise<FirebaseFirestore.DocumentData | null> {
  return adminDb.runTransaction(async tx => {
    const snap = await tx.get(ref)
    if (!snap.exists) return null
    const d = snap.data()!
    if (d.status !== 'accepted' || d[flag] === true) return null
    const current = d.slotDatetime instanceof Timestamp ? d.slotDatetime.toMillis() : NaN
    if (current !== slotMs) return null
    tx.update(ref, {
      [flag]: true,
      [`${flag}At`]: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    return d
  })
}

/**
 * Suelta la marca tras un envío fallido, pero solo si sigue siendo NUESTRA:
 * si mientras tanto se programó el recordatorio en Resend (scheduledEmails) o
 * la cita cambió de horario/estado, no se toca (antes se ponía en false a
 * ciegas y el cron podía mandar un duplicado del correo ya programado).
 */
async function releaseClaim(ref: FirebaseFirestore.DocumentReference, flag: Flag, slotMs: number) {
  const scheduledKey = flag === 'reminder24Sent' ? 'h24' : 'h2'
  await adminDb.runTransaction(async tx => {
    const snap = await tx.get(ref)
    if (!snap.exists) return
    const d = snap.data()!
    const current = d.slotDatetime instanceof Timestamp ? d.slotDatetime.toMillis() : NaN
    if (d[flag] !== true || current !== slotMs || d.status !== 'accepted') return
    if (d.scheduledEmails && typeof d.scheduledEmails === 'object' && d.scheduledEmails[scheduledKey]) return
    tx.update(ref, { [flag]: false, [`${flag}At`]: FieldValue.delete() })
  }).catch(err => console.error(`releaseClaim ${ref.id}/${flag} failed:`, err))
}

export async function runClientReminders(now: Date = new Date()): Promise<ClientRemindersResult> {
  const result: ClientRemindersResult = { sent24: 0, sent2: 0, quiet: isQuietHours(now), errors: [] }

  // ——— «Confirma tu cita de mañana»: solo el día anterior (CDMX), 08:00–22:00 ———
  if (!result.quiet) {
    const { start, end } = tomorrowRangeCdmx(now)
    // No reintentar desde el outbox ya entrada la noche ni demasiado cerca de la cita.
    const quietToday = fromZonedTime(`${cdmxDateKey(now)}T${String(QUIET_START_HOUR).padStart(2, '0')}:00:00`, BUSINESS_TZ)
    try {
      const snap = await adminDb
        .collection('appointments')
        .where('status', '==', 'accepted')
        .where('slotDatetime', '>=', Timestamp.fromDate(start))
        .where('slotDatetime', '<', Timestamp.fromDate(end))
        .where('reminder24Sent', '==', false)
        .get()

      for (const doc of snap.docs) {
        const slot = (doc.data().slotDatetime as Timestamp).toDate()
        if (!inReminder24Window(slot, now)) continue
        try {
          const fresh = await claimReminder(doc.ref, 'reminder24Sent', slot.getTime())
          if (!fresh) continue
          try {
            await sendReminder24Confirm(mapAppointment(doc.id, fresh), {
              idempotencyKey: `cron-h24/${doc.id}-${slot.getTime()}`,
              notAfter: new Date(Math.min(quietToday.getTime(), slot.getTime() - 3 * 60 * MIN)),
            })
            result.sent24++
          } catch (err) {
            await releaseClaim(doc.ref, 'reminder24Sent', slot.getTime())
            result.errors.push(`24h reminder failed for ${doc.id}: ${err}`)
          }
        } catch (err) {
          result.errors.push(`24h reminder claim failed for ${doc.id}: ${err}`)
        }
      }
    } catch (err) {
      result.errors.push(`24h reminder query failed: ${err}`)
    }
  }

  // ——— «Tu cita es en 2 horas»: solo si faltan entre 1 h 45 y 2 h 15 ———
  try {
    const { start, end } = reminder2Range(now)
    const snap = await adminDb
      .collection('appointments')
      .where('status', '==', 'accepted')
      .where('slotDatetime', '>=', Timestamp.fromDate(start))
      .where('slotDatetime', '<=', Timestamp.fromDate(end))
      .where('reminder2Sent', '==', false)
      .get()

    for (const doc of snap.docs) {
      const slot = (doc.data().slotDatetime as Timestamp).toDate()
      if (!inReminder2Window(slot, now)) continue
      try {
        const fresh = await claimReminder(doc.ref, 'reminder2Sent', slot.getTime())
        if (!fresh) continue
        try {
          await sendReminder(mapAppointment(doc.id, fresh), 2, {
            idempotencyKey: `cron-h2/${doc.id}-${slot.getTime()}`,
            // Un «en 2 horas» que no salió a tiempo ya no se manda.
            notAfter: new Date(slot.getTime() - 75 * MIN),
          })
          result.sent2++
        } catch (err) {
          await releaseClaim(doc.ref, 'reminder2Sent', slot.getTime())
          result.errors.push(`2h reminder failed for ${doc.id}: ${err}`)
        }
      } catch (err) {
        result.errors.push(`2h reminder claim failed for ${doc.id}: ${err}`)
      }
    }
  } catch (err) {
    result.errors.push(`2h reminder query failed: ${err}`)
  }

  return result
}
