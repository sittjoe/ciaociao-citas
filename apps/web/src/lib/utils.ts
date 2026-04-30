import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow, isToday, isTomorrow, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, "EEEE d 'de' MMMM, yyyy", { locale: es })
}

export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'HH:mm', { locale: es })
}

export function formatShortDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  if (isToday(d)) return `Hoy, ${format(d, 'HH:mm')}`
  if (isTomorrow(d)) return `Mañana, ${format(d, 'HH:mm')}`
  return format(d, "EEE d MMM, HH:mm", { locale: es })
}

export function formatRelative(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return formatDistanceToNow(d, { addSuffix: true, locale: es })
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
    const key = format(item.datetime, 'yyyy-MM-dd')
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {})
}

export function sanitize(text: string): string {
  return text.replace(/<[^>]*>/g, '').trim()
}

export function csvRow(values: (string | number | undefined | null)[]): string {
  return values.map(v => {
    const s = String(v ?? '').replace(/\r?\n/g, ' ').replace(/"/g, '""')
    return `"${s}"`
  }).join(',')
}
