import type { AppointmentType, CommercialPriority, CommercialStatus, EngagementBrief } from '@/types'

export const commercialStatusLabels: Record<CommercialStatus, string> = {
  pending:       'Pendiente',
  prepared:      'Preparada',
  completed:     'Completada',
  purchased:     'Compró',
  not_purchased: 'No compró',
  follow_up:     'Follow-up',
}

export const appointmentTypeLabels: Record<AppointmentType, string> = {
  showroom: 'Showroom privado',
  video_engagement_rings: 'Video anillo',
}

export function normalizeAppointmentType(value: unknown): AppointmentType {
  return value === 'video_engagement_rings' ? 'video_engagement_rings' : 'showroom'
}

export function isVideoEngagement(value: unknown): boolean {
  return normalizeAppointmentType(value) === 'video_engagement_rings'
}

export function engagementBriefRows(brief?: EngagementBrief | null): [string, string][] {
  if (!brief) return []
  return [
    ['Timeline propuesta', brief.proposalTimeline ?? ''],
    ['Etapa', brief.ringStage ?? ''],
    ['Metal', brief.metalPreference ?? ''],
    ['Piedra', brief.stonePreference ?? ''],
    ['Talla', brief.ringSizeKnown ?? ''],
    ['Estilo pareja', brief.partnerStyle ?? ''],
    ['Referencias', brief.referenceLinks ?? ''],
  ].filter(([, value]) => Boolean(value?.trim())) as [string, string][]
}

export function getCommercialPriority(input: {
  productType?: string | null
  budgetRange?: string | null
  lookingFor?: string | null
}): CommercialPriority {
  const product = input.productType ?? ''
  const budget  = input.budgetRange ?? ''
  const text    = input.lookingFor ?? ''

  if (
    product === 'Diseño personalizado' ||
    budget === '$30,000 - $60,000 MXN' ||
    budget === 'Más de $60,000 MXN' ||
    text.trim().length >= 180
  ) {
    return 'high'
  }

  if (product || budget || text.trim().length > 0) return 'medium'
  return 'normal'
}

export function formatWhatsAppUrl(phone: string, name?: string): string {
  const digits = phone.replace(/\D/g, '')
  const normalized = digits.length === 10 ? `52${digits}` : digits
  const text = encodeURIComponent(`Hola${name ? ` ${name}` : ''}, te escribimos de Ciao Ciao Joyería sobre tu cita.`)
  return `https://wa.me/${normalized}?text=${text}`
}
