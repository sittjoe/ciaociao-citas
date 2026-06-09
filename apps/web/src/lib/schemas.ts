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
  'Menos de $5,000 MXN',
  '$5,000 - $15,000 MXN',
  '$15,000 - $30,000 MXN',
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
})

export type AppointmentDecisionInput = z.infer<typeof appointmentDecisionSchema>

export const slotSchema = z.object({
  datetime: z.string().datetime({ message: 'Fecha inválida' }),
})

export const bulkSlotsSchema = z.object({
  dates: z.array(z.string()).min(1),
  times: z.array(z.string()).min(1),
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
  meetingUrl: z.string().url('URL inválida').max(500).optional().or(z.literal('')),
  meetingProvider: z.string().max(80, 'Máximo 80 caracteres').optional().or(z.literal('')),
  meetingInstructions: z.string().max(700, 'Máximo 700 caracteres').optional().or(z.literal('')),
})

export type CommercialUpdateInput = z.infer<typeof commercialUpdateSchema>
