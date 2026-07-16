import { adminDb } from '@/lib/firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { fromZonedTime } from 'date-fns-tz'
import { BUSINESS_TZ } from '@/lib/utils'
import { businessDateKey, getBlockedDateSet } from '@/lib/blocked-dates'
import { getSlotSchedules } from '@/lib/slot-schedule'

export interface GenerateSlotsResult {
  created: number
  skipped: number
  blockedDays: number
  /** Cuántos horarios recurrentes alimentaron esta corrida. */
  schedules: number
}

/**
 * Genera slots futuros según el horario recurrente (config/slotSchedule,
 * ver lib/slot-schedule). Lógica extraída de /api/cron/generate-slots para
 * poder invocarla también desde el botón «Publicar semanas» del panel
 * (/api/admin/slots/publish).
 *
 * Idempotente: el id del slot es el epoch ms del datetime, el mismo esquema
 * que el alta manual (/api/admin/slots), así nunca duplica ni pisa un slot
 * ya reservado. Salta días bloqueados y horas pasadas.
 *
 * `horizonDays`, si se pasa, sustituye el horizonte propio de cada schedule
 * (p. ej. publicar exactamente N semanas desde el panel). Sin él, cada
 * schedule usa su `horizonDays` configurado.
 */
export async function generateSlots(
  { horizonDays }: { horizonDays?: number } = {},
): Promise<GenerateSlotsResult> {
  const [schedules, blocked] = await Promise.all([getSlotSchedules(), getBlockedDateSet()])
  const now = new Date()
  const horizonFor = (schedHorizon: number) => horizonDays ?? schedHorizon
  const maxHorizon = Math.max(...schedules.map(s => horizonFor(s.horizonDays)))

  let created = 0
  let skipped = 0
  let blockedDays = 0

  for (let i = 0; i <= maxHorizon; i++) {
    const day = new Date(now.getTime() + i * 86_400_000)
    const dateKey = businessDateKey(day) // YYYY-MM-DD en zona CDMX
    if (blocked.has(dateKey)) {
      blockedDays++
      continue
    }
    // Día de la semana de esa fecha CDMX (mediodía UTC evita bordes de zona).
    const [y, m, d] = dateKey.split('-').map(Number)
    const weekday = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()

    for (const sch of schedules) {
      if (i > horizonFor(sch.horizonDays)) continue
      if (!sch.weekdays.includes(weekday)) continue

      for (const time of sch.times) {
        const dt = fromZonedTime(`${dateKey}T${time}:00`, BUSINESS_TZ)
        if (Number.isNaN(dt.getTime()) || dt <= now) {
          skipped++
          continue
        }
        const key = String(dt.getTime())
        const ref = adminDb.collection('slots').doc(key)
        // Transacción: la lectura va ANTES de la escritura (regla dura de Firestore).
        const didCreate = await adminDb.runTransaction(async tx => {
          const existing = await tx.get(ref)
          if (existing.exists) return false
          tx.create(ref, {
            datetime: Timestamp.fromDate(dt),
            available: true,
            slotType: sch.slotType,
            heldUntil: null,
            bookedBy: null,
            createdAt: FieldValue.serverTimestamp(),
          })
          return true
        })
        if (didCreate) created++
        else skipped++
      }
    }
  }

  return { created, skipped, blockedDays, schedules: schedules.length }
}
