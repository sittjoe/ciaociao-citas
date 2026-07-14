import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { fromZonedTime } from 'date-fns-tz'
import { BUSINESS_TZ } from '@/lib/utils'
import { businessDateKey, getBlockedDateSet } from '@/lib/blocked-dates'
import { getSlotSchedules } from '@/lib/slot-schedule'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Generador AUTOMÁTICO de horarios. Antes los slots se publicaban 100% a mano
 * y se agotaban → las clientas no podían agendar (todo "sin horarios"). Este cron
 * diario mantiene siempre publicadas las próximas semanas según config/slotSchedule
 * (o DEFAULT_SCHEDULES). Idempotente: el id del slot es el epoch ms del datetime,
 * el mismo esquema que el alta manual (/api/admin/slots), así nunca duplica ni pisa
 * un slot ya reservado. Salta días bloqueados y horas pasadas.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 503 })
  }
  if (request.headers.get('Authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [schedules, blocked] = await Promise.all([getSlotSchedules(), getBlockedDateSet()])
    const now = new Date()
    const maxHorizon = Math.max(...schedules.map(s => s.horizonDays))

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
        if (i > sch.horizonDays) continue
        if (!sch.weekdays.includes(weekday)) continue

        for (const time of sch.times) {
          const dt = fromZonedTime(`${dateKey}T${time}:00`, BUSINESS_TZ)
          if (Number.isNaN(dt.getTime()) || dt <= now) {
            skipped++
            continue
          }
          const key = String(dt.getTime())
          const ref = adminDb.collection('slots').doc(key)
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

    return NextResponse.json({ ok: true, created, skipped, blockedDays, schedules: schedules.length })
  } catch (err) {
    console.error('GET /api/cron/generate-slots', err)
    return NextResponse.json({ error: 'Error al generar horarios' }, { status: 500 })
  }
}
