import { z } from 'zod'

export const bookingSchema = z.object({
  slotId: z.string().min(1, 'Selecciona un horario'),
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

export type BookingInput = z.infer<typeof bookingSchema>

export const adminLoginSchema = z.object({
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
