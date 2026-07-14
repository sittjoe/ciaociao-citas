import { adminDb } from '@/lib/firebase-admin'
import type { AppointmentType } from '@/types'

/**
 * Horario recurrente que alimenta el generador automático de slots
 * (/api/cron/generate-slots). Editable sin código: documento Firestore
 * `config/slotSchedule` con { schedules: SlotSchedule[] }. Si no existe,
 * se usan estos valores por defecto (derivados del patrón real que el
 * showroom publicaba: lun-sáb, 10:00-13:00 y 15:00-17:00).
 */
export interface SlotSchedule {
  /** Días de la semana (0=domingo … 6=sábado) en que se abren horarios. */
  weekdays: number[]
  /** Horas locales CDMX en formato HH:MM. */
  times: string[]
  /** Tipo de cita al que sirven estos horarios. */
  slotType: AppointmentType
  /** Cuántos días hacia adelante mantener publicados. */
  horizonDays: number
}

export const DEFAULT_SCHEDULES: SlotSchedule[] = [
  {
    weekdays: [1, 2, 3, 4, 5, 6], // lunes a sábado
    times: ['10:00', '11:00', '12:00', '13:00', '15:00', '16:00', '17:00'],
    slotType: 'showroom',
    horizonDays: 28,
  },
  {
    weekdays: [1, 2, 3, 4, 5], // lunes a viernes
    times: ['11:00', '13:00', '16:00'],
    slotType: 'video_engagement_rings',
    horizonDays: 28,
  },
]

const VALID_TIME = /^([01]\d|2[0-3]):[0-5]\d$/

function sanitize(raw: unknown): SlotSchedule | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const weekdays = Array.isArray(r.weekdays)
    ? [...new Set(r.weekdays.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))]
    : []
  const times = Array.isArray(r.times)
    ? [...new Set(r.times.map(String).filter(t => VALID_TIME.test(t)))].sort()
    : []
  if (!weekdays.length || !times.length) return null
  const slotType: AppointmentType = r.slotType === 'video_engagement_rings' ? 'video_engagement_rings' : 'showroom'
  const horizonDays = Number.isFinite(Number(r.horizonDays))
    ? Math.min(90, Math.max(1, Math.round(Number(r.horizonDays))))
    : 28
  return { weekdays, times, slotType, horizonDays }
}

/** Lee la config de Firestore; cae a DEFAULT_SCHEDULES si no existe o es inválida. */
export async function getSlotSchedules(): Promise<SlotSchedule[]> {
  try {
    const doc = await adminDb.collection('config').doc('slotSchedule').get()
    if (doc.exists) {
      const data = doc.data()
      const list = Array.isArray(data?.schedules) ? data!.schedules : []
      const cleaned = list.map(sanitize).filter((s): s is SlotSchedule => s !== null)
      if (cleaned.length) return cleaned
    }
  } catch (err) {
    console.error('getSlotSchedules failed, using defaults:', err)
  }
  return DEFAULT_SCHEDULES
}
