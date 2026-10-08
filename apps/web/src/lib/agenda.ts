import type { CommercialPriority } from '@/types'

/*
 * Lógica pura de la agenda del panel (Agenda, bandeja de solicitudes):
 * tiempos de espera, orden de la bandeja y huecos del día. Sin fechas del
 * servidor ni del navegador dentro: todo recibe `nowMs` para poder probarse
 * y para que servidor y cliente pinten lo mismo al hidratar.
 */

/** Igual que PENDING_ALERT_AFTER_MS de lib/holds.ts (aviso al equipo). */
export const PENDING_ALERT_MINUTES = 20
/** A partir de aquí la espera ya es un problema de servicio. */
export const PENDING_OVERDUE_MINUTES = 120

export function durationLabel(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes))
  if (m < 60) return `${m} min`
  if (m < 48 * 60) {
    const h = Math.floor(m / 60)
    const rest = m % 60
    return rest ? `${h} h ${String(rest).padStart(2, '0')} min` : `${h} h`
  }
  const d = Math.floor(m / 1440)
  return `${d} días`
}

export type WaitLevel = 'fresh' | 'alerted' | 'overdue'

export function waitLevel(createdAtMs: number, nowMs: number): WaitLevel {
  const minutes = (nowMs - createdAtMs) / 60_000
  if (minutes >= PENDING_OVERDUE_MINUTES) return 'overdue'
  if (minutes >= PENDING_ALERT_MINUTES) return 'alerted'
  return 'fresh'
}

/** «en 45 min», «en 2 h 10 min», «hace 5 min». */
export function relativeLabel(targetMs: number, nowMs: number): string {
  const minutes = Math.round((targetMs - nowMs) / 60_000)
  if (minutes === 0) return 'ahora'
  return minutes > 0 ? `en ${durationLabel(minutes)}` : `hace ${durationLabel(-minutes)}`
}

export interface InboxItem {
  id: string
  slotDatetime: string
  createdAt: string
  commercialPriority?: CommercialPriority
}

const PRIORITY_RANK: Record<CommercialPriority, number> = { high: 0, medium: 1, normal: 2 }
const SOON_MS = 48 * 60 * 60 * 1000

/**
 * Orden de la bandeja: primero lo que ocurre pronto (≤48 h, por hora de la
 * cita: si no se decide hoy, la clienta no alcanza a organizarse), luego por
 * prioridad comercial y al final quien lleva más tiempo esperando.
 */
export function sortInbox<T extends InboxItem>(items: T[], nowMs: number): T[] {
  return [...items].sort((a, b) => {
    const sa = new Date(a.slotDatetime).getTime()
    const sb = new Date(b.slotDatetime).getTime()
    const soonA = sa - nowMs <= SOON_MS
    const soonB = sb - nowMs <= SOON_MS
    if (soonA !== soonB) return soonA ? -1 : 1
    if (soonA && soonB && sa !== sb) return sa - sb
    const pa = PRIORITY_RANK[a.commercialPriority ?? 'normal']
    const pb = PRIORITY_RANK[b.commercialPriority ?? 'normal']
    if (pa !== pb) return pa - pb
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })
}

/** Siete claves yyyy-MM-dd consecutivas a partir de `startKey` (calendario, sin zona). */
export function nextDayKeys(startKey: string, count: number): string[] {
  const [y, m, d] = startKey.split('-').map(Number)
  return Array.from({ length: count }, (_, i) => {
    const dt = new Date(Date.UTC(y, m - 1, d + i))
    return dt.toISOString().slice(0, 10)
  })
}

/** Lunes (yyyy-MM-dd) de la semana de `dateKey`. `isoWeekday`: 1 = lunes … 7 = domingo. */
export function weekStartKey(dateKey: string, isoWeekday: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - (isoWeekday - 1))).toISOString().slice(0, 10)
}

export interface WeekBucket {
  weekKey: string
  attended: number
  noShow: number
  unmarked: number
}

/**
 * Citas confirmadas por semana (ya ocurridas), separadas por asistencia.
 * `rows` trae la clave de semana de cada cita y su `attended` (true, false o
 * null si nadie la marcó). Devuelve una cubeta por cada semana pedida, aunque
 * esté vacía, para que la gráfica no salte semanas.
 */
export function bucketByWeek(
  weekKeys: string[],
  rows: Array<{ weekKey: string; attended: boolean | null }>,
): WeekBucket[] {
  const map = new Map(weekKeys.map(k => [k, { weekKey: k, attended: 0, noShow: 0, unmarked: 0 }]))
  for (const row of rows) {
    const bucket = map.get(row.weekKey)
    if (!bucket) continue
    if (row.attended === true) bucket.attended++
    else if (row.attended === false) bucket.noShow++
    else bucket.unmarked++
  }
  return weekKeys.map(k => map.get(k)!)
}

/** Asistencia sobre las citas que SÍ se marcaron; null si no hay ninguna marcada. */
export function attendanceRate(buckets: WeekBucket[]): number | null {
  const attended = buckets.reduce((n, b) => n + b.attended, 0)
  const noShow = buckets.reduce((n, b) => n + b.noShow, 0)
  return attended + noShow > 0 ? Math.round((attended / (attended + noShow)) * 100) : null
}
