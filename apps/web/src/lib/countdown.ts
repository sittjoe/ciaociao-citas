/** «Faltan 3 días y 4 horas». Exportado para probarlo sin navegador. */
export function countdownLabel(targetMs: number, nowMs: number): string | null {
  const diff = targetMs - nowMs
  if (diff <= 0) return null
  const minutes = Math.floor(diff / 60_000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  if (days >= 1) {
    return hours > 0
      ? `Faltan ${plural(days, 'día', 'días')} y ${plural(hours, 'hora', 'horas')}`
      : `Faltan ${plural(days, 'día', 'días')}`
  }
  if (hours >= 1) {
    return mins > 0
      ? `Faltan ${plural(hours, 'hora', 'horas')} y ${plural(mins, 'minuto', 'minutos')}`
      : `Faltan ${plural(hours, 'hora', 'horas')}`
  }
  return mins >= 1 ? `Faltan ${plural(mins, 'minuto', 'minutos')}` : 'Es ahora'
}
