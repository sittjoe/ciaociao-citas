import type { CommercialPriority, CommercialStatus } from '@/types'

export const commercialStatusLabels: Record<CommercialStatus, string> = {
  pending:       'Pendiente',
  prepared:      'Preparada',
  completed:     'Completada',
  purchased:     'Compró',
  not_purchased: 'No compró',
  follow_up:     'Follow-up',
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
