import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatDistanceToNow, isToday, isTomorrow, parseISO } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { es } from 'date-fns/locale'

export const BUSINESS_TZ = 'America/Mexico_City'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

function toDate(date: Date | string): Date {
  return typeof date === 'string' ? parseISO(date) : date
}

export function formatDate(date: Date | string): string {
  return formatInTimeZone(toDate(date), BUSINESS_TZ, "EEEE d 'de' MMMM, yyyy", { locale: es })
}

export function formatTime(date: Date | string): string {
  return formatInTimeZone(toDate(date), BUSINESS_TZ, 'HH:mm', { locale: es })
}

export function formatShortDate(date: Date | string): string {
  const d = toDate(date)
  const time = formatInTimeZone(d, BUSINESS_TZ, 'HH:mm')
  if (isToday(d))    return `Hoy, ${time}`
  if (isTomorrow(d)) return `Mañana, ${time}`
  return formatInTimeZone(d, BUSINESS_TZ, 'EEE d MMM, HH:mm', { locale: es })
}

export function formatRelative(date: Date | string): string {
  return formatDistanceToNow(toDate(date), { addSuffix: true, locale: es })
}

/**
 * CDMX wall-clock string (no offset) for calendar UIs that run FullCalendar
 * in UTC-coercion mode (named timeZone, no timezone plugin). Those calendars
 * render the UTC fields of what they receive, so handing them the business
 * wall time keeps events on the correct hour and day.
 */
export function toBusinessWallTime(iso: string, offsetMs = 0): string {
  const instant = new Date(parseISO(iso).getTime() + offsetMs)
  return formatInTimeZone(instant, BUSINESS_TZ, "yyyy-MM-dd'T'HH:mm:ss")
}

export function generateCode(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let result = ''
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  for (const byte of bytes) result += chars[byte % chars.length]
  return result
}

export function groupByDate<T extends { datetime: Date }>(items: T[]): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const key = formatInTimeZone(item.datetime, BUSINESS_TZ, 'yyyy-MM-dd')
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {})
}

export function sanitize(text: string): string {
  // Strip HTML tags and control characters (null bytes, etc.) that could
  // corrupt CSV/ICS exports or logs.
  return text
    .replace(/<[^>]*>/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
}

/**
 * Redacts emails and phone numbers from a string before it is persisted to a
 * log/diagnostic field. Third-party API errors (Resend, Google) can echo the
 * client's email/phone; keep the diagnostic value without storing the PII.
 */
export function redactPII(text: string): string {
  return text
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '***@***')
    .replace(/(\+?\d[\d\s().-]{7,}\d)/g, '***')
}

export function phoneDigits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '')
}

export function csvRow(values: (string | number | undefined | null)[]): string {
  return values.map(v => {
    const raw = String(v ?? '')
    const formulaSafe = /^[\s\t\r]*[=+\-@]/.test(raw) ? `'${raw}` : raw
    const s = formulaSafe.replace(/\r?\n/g, ' ').replace(/"/g, '""')
    return `"${s}"`
  }).join(',')
}
