import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { BUSINESS_TZ } from './utils'

/*
 * Ventanas de envío de los recordatorios a clientas, calculadas SIEMPRE en
 * America/Mexico_City y para que el cron sea correcto a CUALQUIER frecuencia.
 *
 * Contexto (oct-2026): /api/reminders no corre 1×/día como dice vercel.json;
 * un llamador externo lo invoca cada ~30 min. Las ventanas viejas (24h = de
 * +12h a +36h; 2h = de +1h a +12h) estaban pensadas para una sola corrida y,
 * con 48 corridas al día, el recordatorio salía en el borde más temprano:
 * «tu cita es en 2 horas» a medianoche por una cita de mediodía y «confirma tu
 * cita de mañana» cuando faltaban 2 días. Estas funciones son puras para
 * poder probarlas a cualquier hora simulada.
 */

const MIN = 60 * 1000
const HOUR = 60 * MIN

/** Horario silencioso CDMX: nada de correos a clientas de 22:00 a 08:00. */
export const QUIET_START_HOUR = 22
export const QUIET_END_HOUR = 8

/** El de «en 2 horas» solo sale si faltan entre 1 h 45 y 2 h 15. */
export const H2_WINDOW_MIN_MS = 105 * MIN
export const H2_WINDOW_MAX_MS = 135 * MIN

/**
 * Para el «confirma tu cita de mañana» programado en Resend: si las 24 h antes
 * caen en horario silencioso se mueve dentro de [08:00, 21:30] del día anterior
 * (sigue siendo «mañana» para la clienta).
 */
const SCHEDULED_24_LATEST = '21:30:00'
const SCHEDULED_24_EARLIEST = '08:00:00'

/** yyyy-MM-dd de la fecha en CDMX. */
export function cdmxDateKey(d: Date): string {
  return formatInTimeZone(d, BUSINESS_TZ, 'yyyy-MM-dd')
}

/** Hora (0–23) de pared en CDMX. */
export function cdmxHour(d: Date): number {
  return Number(formatInTimeZone(d, BUSINESS_TZ, 'H'))
}

/** Suma n días a una clave yyyy-MM-dd (aritmética de calendario, sin husos). */
export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

/** Inicio (00:00 CDMX) del día dado por su clave. */
export function cdmxDayStart(key: string): Date {
  return fromZonedTime(`${key}T00:00:00`, BUSINESS_TZ)
}

export function isQuietHours(now: Date): boolean {
  const h = cdmxHour(now)
  return h >= QUIET_START_HOUR || h < QUIET_END_HOUR
}

/** ¿La cita es «mañana» según el calendario de CDMX visto desde `now`? */
export function isTomorrowCdmx(slot: Date, now: Date): boolean {
  return cdmxDateKey(slot) === addDaysToKey(cdmxDateKey(now), 1)
}

/** Rango [inicio, fin) de «mañana» en CDMX, para consultar Firestore. */
export function tomorrowRangeCdmx(now: Date): { start: Date; end: Date } {
  const tomorrow = addDaysToKey(cdmxDateKey(now), 1)
  return { start: cdmxDayStart(tomorrow), end: cdmxDayStart(addDaysToKey(tomorrow, 1)) }
}

/**
 * «Confirma tu cita de mañana»: solo el día ANTERIOR (calendario CDMX) y fuera
 * del horario silencioso. A 30 min de cadencia sale a las 08:00 del día
 * anterior; con el cron diario de Vercel (08:00 CDMX) también.
 */
export function inReminder24Window(slot: Date, now: Date): boolean {
  return slot.getTime() > now.getTime() && isTomorrowCdmx(slot, now) && !isQuietHours(now)
}

/**
 * «Tu cita es en 2 horas»: solo si faltan entre 1 h 45 y 2 h 15. No aplica
 * horario silencioso: va pegado a la hora de la cita que la clienta eligió.
 */
export function inReminder2Window(slot: Date, now: Date): boolean {
  const diff = slot.getTime() - now.getTime()
  return diff >= H2_WINDOW_MIN_MS && diff <= H2_WINDOW_MAX_MS
}

/** Rango de slotDatetime que cae en la ventana de 2 h vista desde `now`. */
export function reminder2Range(now: Date): { start: Date; end: Date } {
  return {
    start: new Date(now.getTime() + H2_WINDOW_MIN_MS),
    end: new Date(now.getTime() + H2_WINDOW_MAX_MS),
  }
}

/**
 * Momento de envío del «mañana» programado en Resend: 24 h antes, pero metido
 * en [08:00, 21:30] CDMX del día anterior a la cita (nunca de madrugada).
 */
export function scheduled24SendAt(slot: Date): Date {
  const target = new Date(slot.getTime() - 24 * HOUR)
  const dayBefore = addDaysToKey(cdmxDateKey(slot), -1)
  const earliest = fromZonedTime(`${dayBefore}T${SCHEDULED_24_EARLIEST}`, BUSINESS_TZ)
  const latest = fromZonedTime(`${dayBefore}T${SCHEDULED_24_LATEST}`, BUSINESS_TZ)
  if (target < earliest) return earliest
  if (target > latest) return latest
  return target
}

/** «hoy» / «mañana» / null comparando fechas CDMX al momento del envío. */
export function relativeDayWord(slot: Date, sendAt: Date): 'hoy' | 'mañana' | null {
  const sk = cdmxDateKey(slot)
  const nk = cdmxDateKey(sendAt)
  if (sk === nk) return 'hoy'
  if (sk === addDaysToKey(nk, 1)) return 'mañana'
  return null
}

/** Correos de rutina (digest, post-visita, lista de espera): fuera del horario silencioso. */
export function inBusinessSendHours(now: Date): boolean {
  return !isQuietHours(now)
}

/** Clave de semana ISO en CDMX, p.ej. «2026-W41», para el recordatorio semanal. */
export function cdmxIsoWeekKey(now: Date): string {
  return formatInTimeZone(now, BUSINESS_TZ, "RRRR-'W'II")
}
