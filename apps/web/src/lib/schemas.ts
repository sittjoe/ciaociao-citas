import { z } from 'zod'

export const productTypeOptions = [
  'Anillo',
  'Aretes',
  'Collar',
  'Pulsera',
  'Dije',
  'Regalo',
  'Diseño personalizado',
  'No estoy seguro/a',
] as const

export const budgetRangeOptions = [
  '$20,000 - $30,000 MXN',
  '$30,000 - $60,000 MXN',
  'Más de $60,000 MXN',
  'Aún no lo sé',
] as const

export const commercialStatusOptions = [
  'pending',
  'prepared',
  'completed',
  'purchased',
  'not_purchased',
  'follow_up',
] as const

export const appointmentTypeOptions = [
  'showroom',
  'video_engagement_rings',
] as const

export const appointmentTypeLabels = {
  showroom: 'Showroom privado',
  video_engagement_rings: 'Video consulta de anillo',
} as const

export const proposalTimelineOptions = [
  '0-1 mes',
  '1-3 meses',
  '3-6 meses',
  'Sin fecha definida',
] as const

export const ringStageOptions = [
  'Solo explorando',
  'Tengo idea clara',
  'Quiero diseñar desde cero',
  'Busco pieza lista',
] as const

export const metalPreferenceOptions = [
  'Oro amarillo',
  'Oro blanco',
  'Oro rosa',
  'Platino',
  'No sé',
] as const

export const stonePreferenceOptions = [
  'Diamante natural',
  'Diamante laboratorio',
  'Piedra de color',
  'No sé',
] as const

export const ringSizeKnownOptions = [
  'Sí',
  'No',
  'Aproximado',
] as const

export const engagementBriefSchema = z.object({
  proposalTimeline: z.enum(proposalTimelineOptions).optional().or(z.literal('')),
  ringStage: z.enum(ringStageOptions).optional().or(z.literal('')),
  metalPreference: z.enum(metalPreferenceOptions).optional().or(z.literal('')),
  stonePreference: z.enum(stonePreferenceOptions).optional().or(z.literal('')),
  ringSizeKnown: z.enum(ringSizeKnownOptions).optional().or(z.literal('')),
  partnerStyle: z.string().max(700, 'Máximo 700 caracteres').optional().or(z.literal('')),
  referenceLinks: z.string().max(700, 'Máximo 700 caracteres').optional().or(z.literal('')),
})

export const bookingFormSchema = z.object({
  appointmentType: z.enum(appointmentTypeOptions).default('showroom'),
  name: z
    .string()
    .min(3, 'Mínimo 3 caracteres')
    .max(100, 'Máximo 100 caracteres')
    .regex(/^[\p{L}\s'.,-]+$/u, 'Solo letras, espacios y caracteres comunes'),
  email: z
    .string()
    .email('Email inválido')
    .max(200, 'Email demasiado largo'),
  phone: z
    .string()
    .min(8, 'Mínimo 8 dígitos')
    .max(20, 'Máximo 20 caracteres')
    .regex(/^[+\d\s\-().]+$/, 'Teléfono inválido'),
  notes: z
    .string()
    .max(500, 'Máximo 500 caracteres')
    .optional()
    .or(z.literal('')),
  productType: z.enum(productTypeOptions).optional().or(z.literal('')),
  budgetRange: z.enum(budgetRangeOptions).optional().or(z.literal('')),
  lookingFor: z
    .string()
    .max(700, 'Máximo 700 caracteres')
    .optional()
    .or(z.literal('')),
  engagementBrief: engagementBriefSchema.optional(),
  whatsapp: z.boolean().default(false),
})

export type BookingFormInput = z.infer<typeof bookingFormSchema>

export const bookingPayloadSchema = bookingFormSchema.extend({
  slotId: z.string().min(1, 'Selecciona un horario'),
})

export type BookingPayloadInput = z.infer<typeof bookingPayloadSchema>

export const adminLoginSchema = z.object({
  email: z.string().email('Email inválido').max(200),
  password: z.string().min(1, 'Contraseña requerida').max(200),
})

export type AdminLoginInput = z.infer<typeof adminLoginSchema>

export const appointmentDecisionSchema = z.object({
  action: z.enum(['accept', 'reject']),
  reason: z.string().max(500).optional(),
  meetingUrl: z.string().url('URL inválida').max(500)
    .refine(v => { try { const u = new URL(v); return u.protocol === 'http:' || u.protocol === 'https:' } catch { return false } },
      'La URL debe empezar con http:// o https://')
    .optional().or(z.literal('')),
  meetingProvider: z.string().max(80, 'Máximo 80 caracteres').optional().or(z.literal('')),
  meetingInstructions: z.string().max(700, 'Máximo 700 caracteres').optional().or(z.literal('')),
})

export type AppointmentDecisionInput = z.infer<typeof appointmentDecisionSchema>

export const batchDecisionSchema = z.object({
  ids: z.array(z.string().min(1).max(128)).min(1, 'Selecciona al menos una cita').max(50, 'Máximo 50 citas por lote'),
  action: z.enum(['accept', 'reject']),
  reason: z.string().max(500).optional(),
})

export type BatchDecisionInput = z.infer<typeof batchDecisionSchema>

export const attendanceSchema = z.object({
  attended: z.boolean(),
})

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha YYYY-MM-DD inválida')
export const blockDatesSchema = z.object({
  from: dateKey,
  to: dateKey,
  reason: z.string().max(120).optional(),
}).refine(v => v.from <= v.to, { message: 'El rango de fechas es inválido' })

export type BlockDatesInput = z.infer<typeof blockDatesSchema>

export const slotSchema = z.object({
  datetime: z.string().datetime({ message: 'Fecha inválida' }),
})

export const bulkSlotsSchema = z.object({
  // Hard caps bound the work: at most 120 dates × 24 times = 2880 slots per
  // call, so a malformed request can't trigger tens of thousands of writes.
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha YYYY-MM-DD inválida')).min(1).max(120, 'Máximo 120 fechas'),
  times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora HH:MM inválida')).min(1).max(24, 'Máximo 24 horarios'),
  slotType: z.enum(appointmentTypeOptions).default('showroom'),
})

export const guestInputSchema = z.object({
  name: z
    .string()
    .min(2, 'Mínimo 2 caracteres')
    .max(100, 'Máximo 100 caracteres')
    .regex(/^[\p{L}\s'.,-]+$/u, 'Solo letras y caracteres comunes'),
  email: z.string().email('Email inválido').max(200),
})

export type GuestInput = z.infer<typeof guestInputSchema>

export const guestVerifySchema = z.object({
  identificationUrl: z.string().min(1, 'URL requerida'),
})

export const adminGuestActionSchema = z.object({
  action: z.enum(['verify', 'exclude']),
})

export const rescheduleSchema = z.object({
  newSlotId: z.string().min(1, 'Slot requerido'),
})

export type RescheduleInput = z.infer<typeof rescheduleSchema>

export const waitlistSchema = z.object({
  appointmentType: z.enum(appointmentTypeOptions).default('showroom'),
  name: z
    .string()
    .min(3, 'Mínimo 3 caracteres')
    .max(100, 'Máximo 100 caracteres')
    .regex(/^[\p{L}\s'.,-]+$/u, 'Solo letras, espacios y caracteres comunes'),
  email: z.string().email('Email inválido').max(200),
  phone: z
    .string()
    .min(8, 'Mínimo 8 dígitos')
    .max(20, 'Máximo 20 caracteres')
    .regex(/^[+\d\s\-().]+$/, 'Teléfono inválido'),
  productType: z.enum(productTypeOptions).optional().or(z.literal('')),
  budgetRange: z.enum(budgetRangeOptions).optional().or(z.literal('')),
  message: z.string().max(700, 'Máximo 700 caracteres').optional().or(z.literal('')),
})

export type WaitlistInput = z.infer<typeof waitlistSchema>

export const commercialUpdateSchema = z.object({
  commercialStatus: z.enum(commercialStatusOptions).default('pending'),
  internalNote: z.string().max(1000, 'Máximo 1000 caracteres').optional().or(z.literal('')),
  followUpAt: z.string().datetime('Fecha inválida').optional().or(z.literal('')),
  meetingUrl: z.string().url('URL inválida').max(500)
    .refine(v => { try { const u = new URL(v); return u.protocol === 'http:' || u.protocol === 'https:' } catch { return false } },
      'La URL debe empezar con http:// o https://')
    .optional().or(z.literal('')),
  meetingProvider: z.string().max(80, 'Máximo 80 caracteres').optional().or(z.literal('')),
  meetingInstructions: z.string().max(700, 'Máximo 700 caracteres').optional().or(z.literal('')),
})

export type CommercialUpdateInput = z.infer<typeof commercialUpdateSchema>
