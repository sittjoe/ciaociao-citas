import { z } from 'zod'

export const bookingFormSchema = z.object({
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
